/**
 * N5 VendorView — partitioned WebContentsView escape hatch for vendor consoles.
 *
 * SoT: .claude/rules/source-of-truth.md → Station desktop VendorView
 * Named IPC only — no executeJavaScript / DOM-macro channel.
 */

const { WebContentsView, session, shell } = require('electron');

/** Top chrome strip (px) left for React Close control above the native view. */
const CHROME_H = 48;

/** Vendor partition → allowed hostname suffixes (leading-dot = endsWith). */
const PARTITION_HOST_SUFFIXES = {
  'persist:zendesk': ['.zendesk.com'],
  // Marketplace Listings port (Unbox Listings display, anchored in Displays).
  // `.ebay.com` + its subdomains ONLY — a regional TLD (ebay.co.uk, ebay.de) is
  // a new entry here, never a widened regex: this list is the security boundary
  // that keeps a signed-in vendor session off an arbitrary host.
  'persist:ebay': ['.ebay.com'],
};

const ALLOWED_PARTITIONS = new Set(Object.keys(PARTITION_HOST_SUFFIXES));

/** @type {import('electron').BrowserWindow | null} */
let hostWindow = null;
/** @type {import('electron').WebContentsView | null} */
let vendorView = null;
/** @type {string | null} */
let activePartition = null;
/**
 * True when the view was opened against a caller-supplied rect (the Listings
 * dropdown anchored inside the Displays column) rather than the full-window
 * takeover. An anchored view must NOT be re-slammed to full-window on resize —
 * the renderer owns that rect and re-pushes it from its own ResizeObserver.
 */
let anchored = false;

/**
 * Liveness watchdog for ANCHORED views — the "never strand a view again" floor.
 *
 * Every other defence here reacts to a signal that something went wrong
 * (unmount cleanup, `did-navigate`, `render-process-gone`, window close). The
 * failure that actually stranded a listing over the app produced NO signal: a
 * dev hot-reload crashed the React subtree, so cleanup never ran, the process
 * stayed alive, and no navigation occurred. A native view has no DOM parent, so
 * nothing else was left to remove it and the operator had no control to click.
 *
 * So an anchored view is a LEASE, not a grant: the renderer re-asserts it on a
 * timer, and Main drops the view when the assertions stop. Absence of a
 * heartbeat covers every cause at once — crash, hang, discarded module, or a
 * future bug in the renderer's own teardown.
 *
 * Takeover views are deliberately NOT leased: they are full-window with visible
 * Close chrome, they predate this port, and a false positive there would yank a
 * helpdesk console out from under an agent mid-reply.
 */
const KEEPALIVE_TIMEOUT_MS = 6000;
const KEEPALIVE_CHECK_MS = 1000;
/** @type {NodeJS.Timeout | null} */
let keepaliveTimer = null;
let lastKeepaliveAt = 0;

function stopKeepaliveWatchdog() {
  if (!keepaliveTimer) return;
  clearInterval(keepaliveTimer);
  keepaliveTimer = null;
}

function startKeepaliveWatchdog() {
  stopKeepaliveWatchdog();
  lastKeepaliveAt = Date.now();
  keepaliveTimer = setInterval(() => {
    if (!vendorView || !anchored) {
      stopKeepaliveWatchdog();
      return;
    }
    // Chromium throttles renderer timers hard while the window is in the
    // background, so a blurred window would stop heartbeating for reasons that
    // are not a failure. Hold the lease open instead of killing a healthy view
    // the moment the operator alt-tabs.
    if (!hostWindow || hostWindow.isDestroyed() || !hostWindow.isFocused()) {
      lastKeepaliveAt = Date.now();
      return;
    }
    if (Date.now() - lastKeepaliveAt <= KEEPALIVE_TIMEOUT_MS) return;
    log().warn('[vendor-view] keepalive lapsed — dropping stranded anchored view');
    hideVendorView();
  }, KEEPALIVE_CHECK_MS);
}

function log() {
  // Injected by main — fall back to console.
  return global.__cfDesktopLog || { info: console.log, warn: console.warn, error: console.error };
}

function isAllowedVendorUrl(partition, url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  const suffixes = PARTITION_HOST_SUFFIXES[partition];
  if (!suffixes) return false;
  const host = parsed.hostname.toLowerCase();
  return suffixes.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix));
}

function contentBoundsBelowChrome() {
  if (!hostWindow || hostWindow.isDestroyed()) {
    return { x: 0, y: CHROME_H, width: 800, height: 600 };
  }
  const [w, h] = hostWindow.getContentSize();
  return {
    x: 0,
    y: CHROME_H,
    width: Math.max(0, w),
    height: Math.max(0, h - CHROME_H),
  };
}

function notifyHidden() {
  try {
    if (hostWindow && !hostWindow.isDestroyed()) {
      hostWindow.webContents.send('cf:vendor-view-did-hide');
    }
  } catch {
    /* host gone */
  }
}

/**
 * Dismissal is scoped to the vendor view's OWN focus (`before-input-event`),
 * never a `globalShortcut`.
 *
 * A global registration takes ⌘] away from the entire app — including
 * `displays-toggle-hotkey.ts`, the SoT owner of the Station Displays toggle.
 * That is what made the embedded listing "not unmount with the right rail":
 * ⌘] reached Main, killed the native view, and never reached the renderer, so
 * the Displays column stayed open around a panel that still believed it was
 * showing a listing.
 *
 * Scoped to focus, both chords do the right thing in both modes: the vendor
 * view handles them while it owns focus, and the renderer's own handlers run
 * when it does not.
 */
function isDismissChord(input) {
  if (input.type !== 'keyDown') return false;
  if (input.key === 'Escape') return true;
  return input.key === ']' && (input.meta || input.control);
}

function detachVendorView() {
  if (!vendorView) return;
  try {
    if (hostWindow && !hostWindow.isDestroyed()) {
      hostWindow.contentView.removeChildView(vendorView);
    }
  } catch {
    /* already detached */
  }
  try {
    const wc = vendorView.webContents;
    if (wc && !wc.isDestroyed()) wc.close();
  } catch {
    /* already closed */
  }
  vendorView = null;
  activePartition = null;
  anchored = false;
  stopKeepaliveWatchdog();
}

/**
 * Hide the VendorView and tell the renderer to clear its mask.
 * Idempotent.
 */
function hideVendorView() {
  const wasOpen = !!vendorView;
  detachVendorView();
  if (wasOpen) notifyHidden();
  // Symmetrical with the open log: a view that stays on screen is either a hide
  // that never arrived (renderer never unmounted) or one that arrived and did
  // not detach. Without this line those two look identical from the outside.
  log().info(`[vendor-view] hide (wasOpen=${wasOpen})`);
  return { success: true };
}

/**
 * @param {import('electron').BrowserWindow} win
 */
function attachHostWindow(win) {
  hostWindow = win;
  win.on('resize', () => {
    if (!vendorView) return;
    // Anchored: the renderer re-measures its slot and pushes bounds itself.
    if (anchored) return;
    try {
      vendorView.setBounds(contentBoundsBelowChrome());
    } catch (err) {
      log().warn('[vendor-view] resize bounds failed:', err?.message || err);
    }
  });
  // A native view has no DOM parent, so the renderer's React cleanup is the ONLY
  // thing that normally removes it — and a reload or a renderer crash skips that
  // cleanup entirely, stranding a vendor page on top of the app with no control
  // left to dismiss it. Main therefore drops the view whenever the renderer it
  // was opened for goes away. `did-navigate` is main-frame document loads only,
  // so client-side route changes (which keep the panel mounted) do not fire it.
  win.webContents.on('did-navigate', () => {
    if (vendorView) hideVendorView();
  });
  win.webContents.on('render-process-gone', () => {
    if (vendorView) hideVendorView();
  });

  win.on('closed', () => {
    detachVendorView();
    hostWindow = null;
  });
}

/**
 * Open (or navigate) the VendorView for a named partition.
 * @param {{ partition: string, url: string, bounds?: { x: number, y: number, width: number, height: number } }} payload
 */
function openVendorView(payload) {
  const partition = String(payload?.partition || '');
  const url = String(payload?.url || '');
  if (!ALLOWED_PARTITIONS.has(partition)) {
    return { success: false, error: `unknown partition: ${partition}` };
  }
  if (!isAllowedVendorUrl(partition, url)) {
    return { success: false, error: 'url not allowlisted for partition' };
  }
  if (!hostWindow || hostWindow.isDestroyed()) {
    return { success: false, error: 'no host window' };
  }
  // `WebContentsView` landed in Electron 30, and the legacy Intel macOS target
  // ships on Electron 22 (electron-builder.mac-intel-legacy.yml) so it can run
  // on macOS 10.13–10.15. Report the capability as unavailable rather than
  // throwing on `new undefined()` — the renderer seam already falls back to
  // opening the vendor console in the OS browser when this returns false.
  if (typeof WebContentsView !== 'function') {
    return { success: false, error: 'vendor view unsupported on this build' };
  }

  try {
    const explicitBounds =
      payload?.bounds && typeof payload.bounds === 'object' ? payload.bounds : null;

    if (vendorView && activePartition === partition) {
      const bounds = explicitBounds ?? contentBoundsBelowChrome();
      anchored = !!explicitBounds;
      if (anchored) startKeepaliveWatchdog();
      else stopKeepaliveWatchdog();
      vendorView.setBounds(bounds);
      void vendorView.webContents.loadURL(url);
      return { success: true };
    }

    detachVendorView();

    const ses = session.fromPartition(partition);
    const view = new WebContentsView({
      webPreferences: {
        session: ses,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
      },
    });

    view.webContents.setWindowOpenHandler(({ url: openUrl }) => {
      if (isAllowedVendorUrl(partition, openUrl)) {
        void view.webContents.loadURL(openUrl);
        return { action: 'deny' };
      }
      void shell.openExternal(openUrl);
      return { action: 'deny' };
    });

    view.webContents.on('will-navigate', (event, navUrl) => {
      if (isAllowedVendorUrl(partition, navUrl)) return;
      event.preventDefault();
      void shell.openExternal(navUrl);
    });

    // Esc / ⌘] inside the vendor console — the renderer cannot hear either
    // while the native view owns focus. Scoped here, not app-wide.
    view.webContents.on('before-input-event', (event, input) => {
      if (!isDismissChord(input)) return;
      event.preventDefault();
      hideVendorView();
    });

    const bounds = explicitBounds ?? contentBoundsBelowChrome();
    anchored = !!explicitBounds;
    if (anchored) startKeepaliveWatchdog();
    else stopKeepaliveWatchdog();

    hostWindow.contentView.addChildView(view);
    view.setBounds(bounds);
    void view.webContents.loadURL(url);

    vendorView = view;
    activePartition = partition;
    log().info(`[vendor-view] open ${partition} → ${url}`);
    return { success: true };
  } catch (err) {
    detachVendorView();
    log().error('[vendor-view] open failed:', err?.stack || err);
    return { success: false, error: err?.message || String(err) };
  }
}

function setVendorViewBounds(bounds) {
  if (!vendorView) return { success: false, error: 'not open' };
  try {
    // A caller-driven rect IS the anchored contract — hold it against resize.
    anchored = true;
    vendorView.setBounds(bounds);
    return { success: true };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
}

function isVendorViewOpen() {
  return { open: !!vendorView, partition: activePartition };
}

/**
 * @param {import('electron').IpcMain} ipcMain
 * @param {() => import('electron').BrowserWindow | null} getMainWindow
 */
function registerVendorViewHandlers(ipcMain, getMainWindow) {
  ipcMain.handle('cf:vendor-view-open', (_event, payload) => {
    const win = getMainWindow();
    if (win && win !== hostWindow) attachHostWindow(win);
    return openVendorView(payload ?? {});
  });

  ipcMain.handle('cf:vendor-view-set-bounds', (_event, bounds) =>
    setVendorViewBounds(bounds ?? contentBoundsBelowChrome()),
  );

  ipcMain.handle('cf:vendor-view-hide', () => hideVendorView());

  // Lease renewal. `on`, not `handle` — the renderer does not await it, and a
  // heartbeat that made the panel wait on Main would be one more thing able to
  // stall the surface it exists to protect.
  ipcMain.on('cf:vendor-view-keepalive', () => {
    lastKeepaliveAt = Date.now();
  });

  ipcMain.handle('cf:vendor-view-is-open', () => isVendorViewOpen());
}

module.exports = {
  CHROME_H,
  attachHostWindow,
  registerVendorViewHandlers,
  hideVendorView,
  // Read by build-watch: a background reload of the host renderer would leave an
  // open VendorView on screen with its React mask gone (the view is attached to
  // the window's contentView, so it survives a renderer reload).
  isVendorViewOpen,
  isAllowedVendorUrl,
  ALLOWED_PARTITIONS,
  PARTITION_HOST_SUFFIXES,
};
