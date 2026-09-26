/** Browser silent-print fallback — renders label/report HTML in a hidden iframe and lets the page's own `window.print()` drive the job. */

interface IframePrintOptions {
  /** Safety-net delay (ms) before the hidden iframe is torn down. Default 60s. */
  removeAfterMs?: number;
  /** Log prefix used if the document can't be mounted. */
  name?: string;
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

/** Safari 5 / older WebKit does not implement iframe.srcdoc. */
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

  if (needsLegacyPopup()) {
    return printHtmlInLegacyPopup(html, options, options.legacyPopup);
  }

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.title = options.name ?? 'Print label';
  // Do not use `display:none` OR `visibility:hidden`:
  iframe.style.cssText =
    'position:fixed;left:-10000px;bottom:0;width:1px;height:1px;border:0;pointer-events:none;';

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
