/**
 * Cycle Forge desktop shell — preload (the trust boundary).
 *
 * Runs sandboxed with contextIsolation on, so a sandboxed preload's `require`
 * is limited to Electron's own subset. `contextBridge` + `ipcRenderer` are
 * available, which is the whole reason `sandbox: false` was not needed.
 *
 * ONE global. Every entry maps to a named capability (N1–N5 in
 * docs/todo/electron-desktop-shell-PLAN.md). There is no filesystem, no
 * `require`, no generic `invoke`, and no `executeJavaScript` macro channel —
 * a renderer compromise cannot reach anything the main process did not name.
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

  /** Surfaced read-only in Settings → About. */
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
