/**
 * Cycle Forge desktop shell — preload (the trust boundary).
 *
 * Runs sandboxed with contextIsolation on, so a sandboxed preload's `require`
 * is limited to Electron's own subset. `contextBridge` + `ipcRenderer` are
 * available, which is the whole reason `sandbox: false` was not needed.
 *
 * ONE global. Every entry maps to a named capability (N1–N7). The filesystem
 * arrived with N6 (operator ruling 2026-08-23, desktop-first pivot) and is
 * scoped in MAIN to operator-opened workspace roots — there is still no
 * `require`, no generic `invoke`, and no `executeJavaScript` macro channel:
 * a renderer compromise cannot reach anything the main process did not name,
 * and cannot reach a byte outside a folder the operator opened.
 *
 * The renderer must NOT read this global directly. Exactly one module names it:
 *   src/lib/desktop/desktop-host.ts
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cycleForgeDesktop', {
  /** Sniffed by the renderer seam to pick the silent-print path. */
  isDesktopHost: true,

  /** 'darwin' | 'win32' | 'linux' */
  platform: process.platform,

  /**
   * N1 — silently print fully-formed HTML to a named OS printer.
   * Resolves { success, reason } — never throws into the renderer.
   */
  printHtml: (html, options) =>
    ipcRenderer.invoke('cf:print-html', { html, options: options ?? {} }),

  /** N2 — installed OS printers: { name, displayName, isDefault }[] */
  listPrinters: () => ipcRenderer.invoke('cf:list-printers'),

  /** Open a URL in the OS browser (allowlisted http(s) only in main). */
  openExternal: (url) => ipcRenderer.invoke('cf:open-external', url),

  /**
   * Mirror the operator's keybindings to the shell so they fire without focus.
   *
   * The renderer's own keydown listener is dead behind a vendor WebContentsView,
   * a print dialog, or any other app in front — which on a bench is most of the
   * shift. Main re-registers these as `globalShortcut`s and injects the keystroke
   * back into the page, the same way the scan hotkey already works.
   *
   * @param {ReadonlyArray<{ id: string, accelerator: string }>} list
   */
  setKeybindings: (list) => ipcRenderer.invoke('cf:set-keybindings', list),

  /**
   * N5 — open a partitioned VendorView (WebContentsView).
   * @param {{ partition: string, url: string, bounds?: { x: number, y: number, width: number, height: number } }} payload
   */
  openVendorView: (payload) => ipcRenderer.invoke('cf:vendor-view-open', payload),

  /** Resize the open VendorView (usually after window resize). */
  setVendorViewBounds: (bounds) =>
    ipcRenderer.invoke('cf:vendor-view-set-bounds', bounds),

  /** Hide / destroy the VendorView. */
  hideVendorView: () => ipcRenderer.invoke('cf:vendor-view-hide'),

  /**
   * Renew the anchored view's lease. Fire-and-forget `send`: Main drops the
   * view when these stop arriving, so a stranded page is impossible even when
   * the renderer never gets to run its own teardown.
   */
  pingVendorView: () => ipcRenderer.send('cf:vendor-view-keepalive'),

  /** { open, partition } */
  isVendorViewOpen: () => ipcRenderer.invoke('cf:vendor-view-is-open'),

  /**
   * Subscribe to Main-driven dismiss (Esc inside the vendor console / Ctrl+]).
   * Returns an unsubscribe function.
   */
  onVendorViewHidden: (listener) => {
    const channel = 'cf:vendor-view-did-hide';
    const handler = () => {
      try {
        listener();
      } catch {
        /* listener fault must not tear down the bridge */
      }
    };
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },

  /**
   * N6 — native file workspaces. Every call resolves
   * `{ ok: true, ... } | { ok: false, error }`; paths outside an
   * operator-opened root are refused in MAIN, structurally.
   */
  files: {
    /** OS folder picker → registers a workspace root, returns its listing. */
    openFolder: () => ipcRenderer.invoke('cf:files-open-folder'),
    /** Roots currently open in this app instance. */
    roots: () => ipcRenderer.invoke('cf:files-roots'),
    /** One directory level: dirs first, then files. */
    scan: (dir) => ipcRenderer.invoke('cf:files-scan', { dir }),
    /** { ok, base64, size } — 64 MB ceiling. */
    read: (p) => ipcRenderer.invoke('cf:files-read', { path: p }),
    write: (p, base64) => ipcRenderer.invoke('cf:files-write', { path: p, base64 }),
    mkdir: (p) => ipcRenderer.invoke('cf:files-mkdir', { path: p }),
    /** Rename and move are one operation; cross-device falls back to copy+rm. */
    move: (from, to) => ipcRenderer.invoke('cf:files-move', { from, to }),
    /** Delete = OS trash. Recoverable, like every other D on this bench. */
    trash: (p) => ipcRenderer.invoke('cf:files-trash', { path: p }),
  },

  /**
   * N7 — paired device grants (WebUSB / Web Serial thermal printers).
   *
   * Pairing itself needs no bridge: `navigator.usb.requestDevice()` works from
   * the renderer once MAIN registers a chooser. What the renderer cannot do is
   * REVOKE — the grant lives in the main process so it can outlive the page —
   * so deleting a printer profile calls this to drop the matching grant and
   * keep the two halves of the pairing in step.
   */
  devices: {
    forget: (match) => ipcRenderer.invoke('cf:forget-paired-device', match),
  },

  /** Surfaced read-only in Settings → About. */
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
