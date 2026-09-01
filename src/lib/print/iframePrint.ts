/**
 * Browser silent-print fallback — renders label/report HTML in a hidden iframe
 * and lets the page's own `window.print()` drive the job.
 *
 * Modern browsers use an iframe (not `window.open` + popup):
 *   - No popup window flashes on screen, and the popup blocker can't intercept
 *     it (a hidden same-document iframe needs no user-gesture popup grant).
 *   - The print originates from the iframe's own document, so `window.print()`
 *     prints exactly that label.
 *
 * Older WebKit is feature-detected below and uses the original popup/document.write
 * path, with the popup reserved synchronously by the station button handler.
 *
 * What makes it SILENT:
 *   Under Chrome/Edge launched with `--kiosk-printing`, any `window.print()`
 *   call prints straight to the *default* printer with NO dialog. Without that
 *   flag the normal print dialog appears (browsers give web pages no other way
 *   to reach a driver-owned OS printer). Prefer WebUSB/Web Serial profiles for
 *   dialog-free thermal labels when possible (see {@link ./browserPrint}).
 *
 * The label HTML embeds its own `window.onload -> window.print()` (so the legacy
 * popup path still drives itself); inside the iframe that same script runs in the
 * frame's context and prints the frame. We only own the iframe lifecycle here.
 *
 * DESKTOP HOST: inside the Electron shell (`electron/`) the same HTML is printed
 * silently with no dialog and no `--kiosk-printing` flag — see
 * {@link ../desktop/desktop-host}. That branch lives HERE, in the one browser
 * fallback every print call site already funnels through, so the five callers
 * stay unchanged and no second print SoT appears.
 */

import { desktopPrintHtml } from '@/lib/desktop/desktop-host';
import { isSilentPrintEnabled } from '@/lib/print/printMode';

export interface IframePrintOptions {
  /** Safety-net delay (ms) before the hidden iframe is torn down. Default 60s. */
  removeAfterMs?: number;
  /** Log prefix used if the document can't be mounted. */
  name?: string;
  /**
   * Desktop host only — OS printer to target. Omitted → the system default,
   * which matches what `--kiosk-printing` does in the browser path.
   */
  deviceName?: string | null;
  /** Popup reserved synchronously from the original button gesture. */
  legacyPopup?: Window | null;
}

function needsLegacyPopup(): boolean {
  if (typeof document === 'undefined') return false;
  const probe = document.createElement('iframe');
  return !('srcdoc' in probe);
}

/**
 * Reserve the original popup path while the button still owns the user gesture.
 * Dynamic imports can finish after that gesture expires on older WebKit.
 */
export function reserveLegacyPrintPopup(): Window | null {
  if (!needsLegacyPopup() || typeof window === 'undefined') return null;
  const popup = window.open('', '_blank', 'width=900,height=700');
  if (!popup) {
    console.warn('Print label: popup blocked');
    return null;
  }
  return popup;
}

/**
 * Safari 5 / older WebKit does not implement iframe.srcdoc. Keep the original
 * station path for those machines: a user-gesture-created popup, document.write
 * of the self-printing 2×1 page, then document.close(). No modern APIs or
 * blob/object URLs are required by this branch.
 */
function printHtmlInLegacyPopup(
  html: string,
  options: IframePrintOptions,
  reservedPopup?: Window | null,
): boolean {
  if (typeof window === 'undefined') return false;
  const popup = reservedPopup ?? window.open('', '_blank', 'width=900,height=700');
  if (!popup) {
    console.warn(`${options.name ?? 'Print label'}: popup blocked`);
    return false;
  }
  try {
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    return true;
  } catch {
    try {
      popup.close();
    } catch {
      /* best effort */
    }
    return false;
  }
}

/**
 * Print fully-formed HTML by mounting it in a hidden iframe. Returns true once
 * the iframe is attached (the print itself is driven by the embedded script /
 * the browser), false if the DOM isn't available.
 */
export function printHtmlInIframe(html: string, options: IframePrintOptions = {}): boolean {
  if (typeof document === 'undefined' || !document.body) return false;

  // Desktop host — print silently to a driver-owned OS printer, the one job the
  // browser paths cannot do. Gated on the SAME per-workstation silent-print
  // switch as every other silent path, so an operator who turns it off still
  // gets a dialog they can pick a printer in.
  if (isSilentPrintEnabled()) {
    const pending = desktopPrintHtml(html, { deviceName: options.deviceName ?? null });
    if (pending) {
      // Fire-and-forget: this function's contract is "the job was handed off",
      // not "the job finished" — identical to the iframe path, whose print is
      // driven by the embedded script after this returns.
      void pending.then((res) => {
        if (!res.success) {
          console.error(`[print] desktop silent print failed: ${res.reason ?? 'unknown'}`);
        }
      });
      return true;
    }
  }

  if (needsLegacyPopup()) {
    return printHtmlInLegacyPopup(html, options, options.legacyPopup);
  }

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.title = options.name ?? 'Print label';
  // Keep it in the layout (display:none can suppress printing in some engines)
  // but visually gone and zero-footprint.
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';

  let removed = false;
  const cleanup = () => {
    if (removed) return;
    removed = true;
    try {
      iframe.remove();
    } catch {
      /* already detached */
    }
  };

  iframe.onload = () => {
    const cw = iframe.contentWindow;
    // Tear down shortly after the job leaves (kiosk: instant; dialog: on close).
    try {
      cw?.addEventListener('afterprint', () => window.setTimeout(cleanup, 250), { once: true });
    } catch {
      /* cross-frame guard — fall back to the timer below */
    }
    window.setTimeout(cleanup, options.removeAfterMs ?? 60_000);
  };

  document.body.appendChild(iframe);
  // srcdoc runs the embedded <script> (window.onload -> window.print()) in the
  // iframe's own document, which is what gets printed.
  iframe.srcdoc = html;
  return true;
}
