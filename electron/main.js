/**
 * Cycle Forge desktop shell — main process.
 *
 * A THIN host for the hosted Next app. It ships no application code and no
 * bundled Next build: it points a hardened BrowserWindow at the deployed origin,
 * so shipping app code never requires shipping an installer.
 *
 * Plan + locked verdict: docs/todo/electron-desktop-shell-PLAN.md
 *
 * It exists to close the gaps a browser cannot close at a bench:
 *   N1  silent print to a NAMED OS/office printer   (browsers: dialog only)
 *   N2  enumerate installed printers                (browsers: no API)
 *   N3  scan hotkey while the window is unfocused   (browsers: focus-scoped)
 *   N4  versioned, auto-updating, chrome-less host  (browsers: "keep a tab open")
 *   N5  VendorView — partitioned WebContentsView    (signed-in vendor escape hatch)
 *
 * HARD BANS:
 *   - Legacy <webview> TAG stays false (will-attach-webview deny). N5 uses the
 *     WebContentsView API + session.fromPartition — never DOM-injection macros.
 *   - No nodeIntegration, no `sandbox: false`.
 *   - No local HTTP sidecar. No file-path printing.
 *   - No generic invoke / executeJavaScript channel for vendor form-fill.
 *
 * Logs (path derives from productName in electron-builder.yml):
 *   macOS:   ~/Library/Logs/Cycle Forge/main.log
 *   Windows: %AppData%\Cycle Forge\logs\main.log
 */

const {
  app,
  BrowserWindow,
  Menu,
  shell,
  ipcMain,
  dialog,
  globalShortcut,
} = require('electron');
const path = require('path');
const {
  attachHostWindow,
  registerVendorViewHandlers,
  isVendorViewOpen,
} = require('./vendor-view');
const { startBuildWatch, stopBuildWatch } = require('./build-watch');

// A logging dependency must never be able to stop the app from launching.
let log;
try {
  log = require('electron-log/main');
  log.initialize();
  log.transports.file.level = 'info';
  log.transports.console.level = 'info';
} catch {
  log = { info: console.log, warn: console.warn, error: console.error };
}
global.__cfDesktopLog = log;

// ---------------------------------------------------------------------------
// Origins
// ---------------------------------------------------------------------------
const DEFAULT_URL = 'https://app.cycleforge.ai';

/**
 * Tenants are served from subdomains (`{slug}.app.cycleforge.ai`, and the kiosk
 * host below that), so the allowlist is SUFFIX-based, not an exact-origin set.
 * An exact set would bounce an operator to the OS browser the moment the org
 * login gate redirected them onto their own tenant host.
 */
const ALLOWED_HOST_SUFFIXES = ['.app.cycleforge.ai'];
const ALLOWED_EXACT_HOSTS = new Set(['app.cycleforge.ai', 'cycleforge.ai']);

const isDev =
  process.env.NODE_ENV === 'development' || !!process.env.ELECTRON_START_URL;

/** The operator's dev server (attach-only — the shell never spawns one). */
const DEV_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function getStartUrl() {
  const configured =
    process.env.ELECTRON_START_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    DEFAULT_URL;
  return configured.replace(/\/+$/, '');
}

/**
 * True when `url` may load INSIDE the shell. Everything else is handed to the
 * OS browser — which is exactly what keeps a vendor deep link (a Zoho PO, an
 * eBay listing) landing in the operator's real, signed-in browser instead of
 * being embedded here.
 */
function isInternalUrl(url, startOrigin) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  if (parsed.origin === startOrigin) return true;
  if (isDev && DEV_HOSTS.has(parsed.hostname)) return true;

  const host = parsed.hostname.toLowerCase();
  if (ALLOWED_EXACT_HOSTS.has(host)) return true;
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

// ---------------------------------------------------------------------------
// Performance flags — must be set before `ready`
// ---------------------------------------------------------------------------
// The PRODUCT name, not the package name and not the tenant.
//
// Packaged builds get this from electron-builder's `productName`, but in dev
// `electron .` falls back to package.json `name` — which is why the macOS app
// menu read "Electron". Set it before `ready` so the menu, the About panel and
// the userData/log paths all agree.
app.setName('Cycle Forge');

app.commandLine.appendSwitch('enable-smooth-scrolling');
// Persistent disk cache so hosted JS/CSS/font chunks survive a relaunch.
// (The legacy shell configured this and then cleared the cache on every launch,
// which cancelled it out. Do not reintroduce a startup clearCache().)
app.commandLine.appendSwitch('disk-cache-size', String(256 * 1024 * 1024));

let mainWindow = null;

// ---------------------------------------------------------------------------
// N1 + N2 — printing
// ---------------------------------------------------------------------------
function registerPrintHandlers() {
  /** N2 — real OS device names, so Settings stops asking staff to type one. */
  ipcMain.handle('cf:list-printers', async () => {
    try {
      const wc = mainWindow?.webContents;
      if (!wc) return [];
      const printers = await wc.getPrintersAsync();
      return printers.map((p) => ({
        name: p.name,
        displayName: p.displayName || p.name,
        isDefault: !!p.isDefault,
      }));
    } catch (err) {
      log.error('[print] list-printers failed:', err?.message || err);
      return [];
    }
  });

  /**
   * N1 — silent print of fully-formed HTML to a NAMED printer.
   *
   * This is the only capability that justifies the shell for printing at all:
   * WebUSB / Web Serial already drive thermal label printers dialog-free
   * (src/lib/print/browserPrint.ts), but neither can reach a driver-owned
   * OS/office printer — that is the `kind: 'os'` profile this handles.
   */
  ipcMain.handle('cf:print-html', async (_event, payload) => {
    const html = payload?.html;
    const options = payload?.options ?? {};
    if (typeof html !== 'string' || !html.trim()) {
      return { success: false, reason: 'no html provided' };
    }

    return new Promise((resolve) => {
      const printWin = new BrowserWindow({
        show: false,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          javascript: true,
        },
      });

      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        try {
          if (!printWin.isDestroyed()) printWin.destroy();
        } catch {
          /* already gone */
        }
        resolve(result);
      };

      // Hard ceiling — a page that never fires did-finish-load must not leak a
      // hidden window (and its promise) for the life of the app.
      const timeout = setTimeout(() => finish({ success: false, reason: 'print timed out' }), 30_000);

      printWin.webContents.once('did-fail-load', (_e, code, desc) =>
        finish({ success: false, reason: `load failed: ${desc} (${code})` }),
      );

      // Label/report HTML embeds `window.onload -> window.print()` so the BROWSER
      // fallback can drive itself. Inside this hidden window that same call would
      // pop the OS print dialog before our controlled silent print runs.
      // Neutralize it at dom-ready — the embedded call is deferred, so this lands
      // first and only the silent print to the chosen device happens.
      printWin.webContents.once('dom-ready', () => {
        printWin.webContents
          .executeJavaScript('window.print = function () {};')
          .catch(() => {});
      });

      printWin.webContents.once('did-finish-load', () => {
        // Give in-page scripts (barcode renderers, web fonts) a moment to paint.
        const waitMs = Number.isFinite(options.waitMs) ? options.waitMs : 450;
        setTimeout(() => {
          try {
            const printOptions = {
              silent: true,
              printBackground: options.printBackground !== false,
              copies: Math.max(1, Number(options.copies) || 1),
              margins: options.margins || { marginType: 'none' },
              color: options.color !== false,
              landscape: !!options.landscape,
            };
            if (options.deviceName) printOptions.deviceName = options.deviceName;
            if (options.pageSize) printOptions.pageSize = options.pageSize;

            printWin.webContents.print(printOptions, (success, reason) => {
              clearTimeout(timeout);
              finish({ success, reason: reason ?? null });
            });
          } catch (err) {
            clearTimeout(timeout);
            finish({ success: false, reason: err?.message || String(err) });
          }
        }, waitMs);
      });

      // Render from a data: URL — the HTML never touches disk.
      const dataUrl =
        'data:text/html;charset=utf-8;base64,' +
        Buffer.from(html, 'utf8').toString('base64');
      printWin.loadURL(dataUrl).catch((err) =>
        finish({ success: false, reason: err?.message || String(err) }),
      );
    });
  });

  /** Deep links out. The renderer can only ever ask for http(s). */
  ipcMain.handle('cf:open-external', async (_event, url) => {
    try {
      const parsed = new URL(String(url));
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return { success: false, error: 'unsupported protocol' };
      }
      await shell.openExternal(parsed.toString());
      return { success: true };
    } catch (err) {
      return { success: false, error: err?.message || String(err) };
    }
  });
}

// ---------------------------------------------------------------------------
// N3 — reclaim a wedge scan while the window is UNFOCUSED
// ---------------------------------------------------------------------------
/**
 * The in-page store (src/lib/scan-hotkey/store.ts) already owns `Insert` while
 * the window has focus, and it is the only thing allowed to decide what a scan
 * means. So the shell registers the shortcut ONLY while unfocused, and its whole
 * job is: raise the window, then replay a REAL key event.
 *
 * `sendInputEvent` injects at the Chromium input layer, so the page receives a
 * trusted keydown indistinguishable from a physical one — which is why this
 * needs zero renderer changes and adds no scan vocabulary to the shell. The
 * shell never reads, buffers, or routes barcode data; `routeScan` stays the one
 * decoder.
 *
 * Limitation (documented, not silent): this binds the DEFAULT `Insert`. A staff
 * override stored in the renderer is not mirrored to the shell yet.
 */
const SCAN_HOTKEY = 'Insert';
let scanHotkeyRegistered = false;

function registerScanHotkey() {
  if (scanHotkeyRegistered || !mainWindow) return;
  try {
    scanHotkeyRegistered = globalShortcut.register(SCAN_HOTKEY, () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      const wc = mainWindow.webContents;
      wc.sendInputEvent({ type: 'keyDown', keyCode: SCAN_HOTKEY });
      wc.sendInputEvent({ type: 'keyUp', keyCode: SCAN_HOTKEY });
    });
    if (!scanHotkeyRegistered) {
      log.warn(`[scan] ${SCAN_HOTKEY} is held by another app — background reclaim is off`);
    }
  } catch (err) {
    log.error('[scan] hotkey register failed:', err?.message || err);
  }
}

function unregisterScanHotkey() {
  if (!scanHotkeyRegistered) return;
  try {
    globalShortcut.unregister(SCAN_HOTKEY);
  } catch {
    /* non-fatal */
  }
  scanHotkeyRegistered = false;
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
function createMenu(win) {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    // Role-based items route Cmd/Ctrl+C/V/X to the focused element. Without an
    // Edit menu these accelerators do not reach the page on macOS at all.
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? [{ role: 'pasteAndMatchStyle' }, { role: 'delete' }, { role: 'selectAll' }]
          : [{ role: 'delete' }, { type: 'separator' }, { role: 'selectAll' }]),
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => win.webContents.reload() },
        { label: 'Open in browser', click: () => shell.openExternal(win.webContents.getURL()) },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        ...(isDev
          ? [
              {
                label: 'Toggle DevTools',
                accelerator: 'CmdOrCtrl+Shift+I',
                click: () => win.webContents.toggleDevTools(),
              },
            ]
          : []),
        { role: 'togglefullscreen' },
      ],
    },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'close' }] },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// Offline / failed-load page
// ---------------------------------------------------------------------------
function failedLoadHtml(startUrl) {
  // startUrl is our own config, but it still reaches an HTML attribute — encode
  // it rather than trusting the shape.
  const safe = String(startUrl).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
  <div style="max-width:520px;padding:32px;border:1px solid rgba(148,163,184,.25);border-radius:18px;background:rgba(15,23,42,.92)">
    <h1 style="margin:0 0 12px;font-size:24px">Cycle Forge is unavailable</h1>
    <p style="margin:0 0 20px;line-height:1.5;color:#cbd5e1">The desktop shell could not reach the app. Check network access, then retry.</p>
    <p style="margin:0 0 24px;padding:12px 14px;border-radius:12px;background:#111827;color:#93c5fd;word-break:break-all">${safe}</p>
    <button onclick="location.href='${safe}'" style="border:0;border-radius:8px;padding:12px 18px;font-weight:600;background:#2563eb;color:#fff;cursor:pointer">Retry</button>
  </div>
</body></html>`)}`;
}

// ---------------------------------------------------------------------------
// Main window
// ---------------------------------------------------------------------------
function createWindow() {
  const startUrl = getStartUrl();
  let startOrigin;
  try {
    startOrigin = new URL(startUrl).origin;
  } catch {
    startOrigin = DEFAULT_URL;
  }

  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    // The station frame locks a 720px centre plus two rails; below ~1200 the
    // yield ladder has nothing left to give (see .claude/rules → Frame column budget).
    minWidth: 1200,
    minHeight: 760,
    show: false,
    title: 'Cycle Forge',
    backgroundColor: '#0f172a',
    // NATIVE TITLE BAR ON BOTH PLATFORMS — do not "reclaim" this strip.
    //
    // `hiddenInset` (what the legacy shell used) overlays the macOS traffic
    // lights ON the web content, and the app's own GlobalHeader puts its nav
    // cluster — sidebar toggle, Pins, Recents — in exactly that top-left corner.
    // The result is close/minimize/zoom sitting on top of the toggle: two
    // controls in one place, and the operator's first click is a coin flip.
    //
    // A frameless window would need the SHELL to inject padding into the hosted
    // app, which means the desktop build silently rendering a different layout
    // from the browser build — the one thing a thin hosted-URL wrapper must not
    // do. The native bar reserves that space at the OS level instead, gives us
    // drag + double-click-to-zoom for free, and costs ~28px once.
    titleBarStyle: 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true, // a sandboxed preload still gets ipcRenderer — nothing lost
      webviewTag: false, // legacy <webview> TAG banned — N5 uses WebContentsView API
      spellcheck: true,
      // Station timers/polling must not be throttled when the operator is in
      // another window — a throttled bench is a bench that misses a scan.
      backgroundThrottling: false,
    },
  });

  createMenu(mainWindow);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternalUrl(url, startOrigin)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isInternalUrl(url, startOrigin)) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  // Refuse permission prompts the station has no use for. Serial/HID stay
  // ALLOWED — that is the WebUSB / Web Serial thermal print path.
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed = new Set(['clipboard-read', 'clipboard-sanitized-write', 'media', 'serial', 'hid', 'usb']);
    callback(allowed.has(permission));
  });

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    // Sub-resource failures and in-flight navigations are not an offline app.
    if (!isMainFrame || code === -3) return;
    log.error(`[load] failed ${code} ${desc} — ${url}`);
    mainWindow.loadURL(failedLoadHtml(startUrl)).catch(() => {});
  });

  mainWindow.on('focus', unregisterScanHotkey);
  mainWindow.on('blur', registerScanHotkey);
  mainWindow.on('closed', () => {
    unregisterScanHotkey();
    stopBuildWatch();
    mainWindow = null;
  });

  attachHostWindow(mainWindow);

  // The title bar names the PRODUCT, never the tenant.
  //
  // Electron adopts the page's <title> by default, and this app's metadata is
  // `{page} · {org}` when signed in (docs/cycle-forge-branding-spec.md §6.1) —
  // so the window chrome was reading "USAV Solutions", the dogfood tenant. That
  // is the same vendor/tenant-on-the-spine mistake the capability rules ban:
  // the org is *content*, the shell is product chrome. Refusing the update keeps
  // the `title` set above authoritative for every tenant.
  mainWindow.on('page-title-updated', (event) => event.preventDefault());

  // A station shell stays open for days, so it would otherwise keep serving the
  // client bundle it booted with until someone reloaded by hand.
  //
  // Not in dev: HMR adds chunks to the page as you navigate, so the chunk set
  // legitimately changes without a deploy — the watcher would read that as a new
  // build and reload the operator's dev shell. Dev already has hot reload.
  if (!isDev) {
    startBuildWatch({
      getWindow: () => mainWindow,
      startUrl,
      isVendorViewOpen,
      log,
    });
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Names the build in support logs, and is the check that the tenant's page
    // <title> never won the title bar.
    log.info(`[startup] shown as "${mainWindow.getTitle()}" · app.name="${app.getName()}"`);
  });
  log.info(`[startup] loading ${startUrl}`);
  mainWindow.loadURL(startUrl);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
// One station window per PC — a second instance would fight over the scan hotkey.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    try {
      registerPrintHandlers();
      registerVendorViewHandlers(ipcMain, () => mainWindow);
      createWindow();
      initAutoUpdater();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
    } catch (err) {
      // Never let an unexpected error leave the operator staring at a headless
      // process — log it and still try to put a window on screen.
      log.error('[startup] unexpected error:', err?.stack || err);
      try {
        createWindow();
      } catch (e2) {
        log.error('[startup] createWindow failed:', e2?.stack || e2);
      }
    }
  });
}

app.on('will-quit', unregisterScanHotkey);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Defence in depth: refuse legacy <webview> TAG attachment. N5 VendorView uses
// the WebContentsView API (not this tag) and is registered separately.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => {
    log.warn('[security] blocked a <webview> tag attachment');
    event.preventDefault();
  });
});

// ---------------------------------------------------------------------------
// N4 — auto-update (packaged builds only)
// ---------------------------------------------------------------------------
function initAutoUpdater() {
  if (isDev || !app.isPackaged) return;

  // The legacy Intel macOS target ships on Electron 22 (the last line that runs
  // on macOS 10.13–10.15 — see electron-builder.mac-intel-legacy.yml). The
  // update feed carries builds made with CURRENT Electron, which require macOS
  // 11 and will not launch on 10.x. An unguarded legacy build would therefore
  // download an update that BRICKS it — a self-inflicted outage on the oldest,
  // least-supported bench in the building.
  //
  // Detect by runtime major rather than a build-time flag, so the guard cannot
  // be lost by packaging the legacy target from the wrong config.
  const electronMajor = parseInt((process.versions.electron || '0').split('.')[0], 10) || 0;
  if (electronMajor > 0 && electronMajor < 23) {
    log.info(`[updater] disabled on legacy Electron ${electronMajor} — updates are installed by hand`);
    return;
  }

  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.logger = log;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    log.info(`[updater] v${app.getVersion()} — checking GitHub Releases`);

    autoUpdater.on('update-available', (info) =>
      log.info(`[updater] update available: v${info?.version} — downloading`),
    );
    autoUpdater.on('update-not-available', () => log.info('[updater] already latest'));
    autoUpdater.on('error', (err) =>
      log.error('[updater] error:', err?.stack || err?.message || String(err)),
    );

    autoUpdater.on('update-downloaded', (info) => {
      dialog
        .showMessageBox({
          type: 'info',
          title: 'Update ready',
          message: `Cycle Forge ${info?.version} has been downloaded.`,
          detail: 'Restart now to apply it, or it installs automatically next time you quit.',
          buttons: ['Restart now', 'Later'],
          defaultId: 0,
        })
        .then(({ response }) => {
          if (response === 0) autoUpdater.quitAndInstall();
        });
    });

    // Deferred so a slow update check never delays first paint.
    setTimeout(() => {
      autoUpdater
        .checkForUpdates()
        .catch((err) => log.error('[updater] check failed:', err?.message || err));
    }, 3000);
  } catch (err) {
    log.error('[updater] init failed:', err?.message || err);
  }
}
