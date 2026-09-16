'use client';

/**
 * Print a LIVE DOM node — the on-screen sheet, exactly as rendered.
 *
 * ## Why this exists
 *
 * Every other print call site in this repo hands `printHtmlInIframe` a string
 * it BUILT (label HTML, the repair paper route's template). The kiosk review
 * step cannot: the sheet the customer is looking at is a React tree, and the
 * document it previews has no row to print yet — `/api/repair-service/print/[id]`
 * needs a persisted `repair_service.id`, which does not exist until the cart
 * submits. Operator 2026-09-15 asked for a print icon on that review display
 * anyway, and the only honest thing to print there is what is on the glass.
 *
 * So: snapshot the node's `outerHTML` and carry the page's own stylesheets with
 * it. Without the second half the iframe renders unstyled text — Tailwind's
 * classes mean nothing in a document that never loaded the stylesheet, and an
 * unstyled repair agreement is worse than no print button.
 *
 * `printHtmlInIframe` still owns the iframe lifecycle, the legacy-WebKit popup
 * path, `--kiosk-printing` silent print and the Electron desktop-host branch.
 * This is a string builder in front of it, never a second print SoT.
 *
 * Callers: `KioskRepairPane` (review step print icon).
 * Affected API: none. Schemas: none.
 */

import { printHtmlInIframe, type IframePrintOptions } from './iframePrint';

/**
 * Every stylesheet the current document loaded, as head markup.
 *
 * `<link>` is copied by href rather than inlined: the iframe is same-origin, so
 * it re-reads from cache, and that avoids walking `cssRules` (which throws on
 * cross-origin sheets and silently drops them).
 */
function collectDocumentStyles(): string {
  const nodes = document.querySelectorAll<HTMLElement>(
    'link[rel="stylesheet"], style',
  );
  return Array.from(nodes)
    .map((node) => node.outerHTML)
    .join('\n');
}

export interface PrintDomNodeOptions extends IframePrintOptions {
  /** `<title>` of the print job — what most browsers put in the filename. */
  title?: string;
  /** Extra CSS appended last, for print-only geometry the screen does not want. */
  printCss?: string;
}

/**
 * Print `node` as its own document. Returns false when there is nothing to
 * print or the iframe could not be mounted — the caller decides whether that
 * is worth telling anyone about.
 *
 * The node is CLONED and its off-screen positioning cleared. Callers print a
 * layout the screen never shows (see `KioskRepairPane`: the A4 print surface,
 * parked off-viewport so it lays out without being visible), and carrying
 * `position:absolute; left:-10000px` into the iframe would print a blank page.
 * Clearing it on the clone beats fighting it with `!important` in `printCss`.
 */
export function printDomNode(
  node: HTMLElement | null,
  options: PrintDomNodeOptions = {},
): boolean {
  if (typeof document === 'undefined' || !node) return false;

  const { title = 'Print', printCss = '', ...iframeOptions } = options;

  const clone = node.cloneNode(true) as HTMLElement;
  clone.removeAttribute('aria-hidden');
  for (const prop of ['position', 'left', 'right', 'top', 'bottom', 'visibility'] as const) {
    clone.style.removeProperty(prop);
  }

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title.replace(/[<&]/g, '')}</title>
${collectDocumentStyles()}
<style>
  /* The node was laid out inside a scroll column; on paper it owns the page. */
  html, body { margin: 0; padding: 0; background: #fff; }
  @page { margin: 12mm; }
  ${printCss}
</style>
</head>
<body>
${clone.outerHTML}
<script>window.onload = function () { window.focus(); window.print(); };</script>
</body>
</html>`;

  return printHtmlInIframe(html, iframeOptions);
}
