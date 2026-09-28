/**
 * The ONE module that names a desktop shell's silent-print bridge. Nothing
 * else reads the shell globals: callers ask {@link desktopPrintHost} and get a
 * host or null (a plain browser).
 *
 * Both shells take the same payload and answer the same result, so a print
 * job is built once and routed to whichever shell the page is running in:
 *
 *   payload  { html: string, options: DesktopPrintOptions }  (fully-formed HTML, no dialog)
 *   result   { success: boolean, reason: string | null }       (never throws)
 *
 * - Electron — the preload exposes `window.cycleForgeDesktop` with
 *   `isDesktopHost: true` and `printHtml(html, options)` (capability N1: a
 *   hidden window, `webContents.print({ silent: true, deviceName, pageSize })`).
 * - Tauri v2 — the shell registers the command `cf_print_html` taking
 *   `{ html, options }` and answering the same result; it is reached through
 *   `window.__TAURI_INTERNALS__.invoke`, which Tauri v2 injects into every
 *   webview it hosts (no `withGlobalTauri` needed).
 */

/** Electron `webContents.print` options the shells honour; `pageSize` is in microns. */
export interface DesktopPrintOptions {
  /** OS printer name; null = the shell's default printer. */
  deviceName: string | null;
  pageSize: { width: number; height: number };
  margins: { marginType: 'none' };
  copies: number;
  color: boolean;
  printBackground: boolean;
}

interface DesktopPrintResult {
  success: boolean;
  reason: string | null;
}

export interface DesktopPrintHost {
  kind: 'electron' | 'tauri';
  printHtml(html: string, options: DesktopPrintOptions): Promise<DesktopPrintResult>;
}

/** Tauri v2 command the shell registers for silent HTML printing. */
const TAURI_PRINT_COMMAND = 'cf_print_html';

interface ElectronBridge {
  isDesktopHost?: boolean;
  printHtml?: (html: string, options: DesktopPrintOptions) => Promise<DesktopPrintResult>;
}

interface TauriInternals {
  invoke?: (command: string, args: Record<string, unknown>) => Promise<unknown>;
}

function settle(run: () => Promise<unknown>): Promise<DesktopPrintResult> {
  return run().then(
    (value) => {
      const result = value as Partial<DesktopPrintResult> | null;
      return { success: result?.success === true, reason: typeof result?.reason === 'string' ? result.reason : null };
    },
    (error: unknown) => ({ success: false, reason: error instanceof Error ? error.message : String(error) }),
  );
}

/** The shell this page runs in, or null in a plain browser. */
export function desktopPrintHost(): DesktopPrintHost | null {
  if (typeof window === 'undefined') return null;
  const shell = window as unknown as { cycleForgeDesktop?: ElectronBridge; __TAURI_INTERNALS__?: TauriInternals };

  const electron = shell.cycleForgeDesktop;
  if (electron?.isDesktopHost && typeof electron.printHtml === 'function') {
    const printHtml = electron.printHtml;
    return { kind: 'electron', printHtml: (html, options) => settle(() => printHtml(html, options)) };
  }

  const invoke = shell.__TAURI_INTERNALS__?.invoke;
  if (typeof invoke === 'function') {
    return { kind: 'tauri', printHtml: (html, options) => settle(() => invoke(TAURI_PRINT_COMMAND, { html, options })) };
  }

  return null;
}
