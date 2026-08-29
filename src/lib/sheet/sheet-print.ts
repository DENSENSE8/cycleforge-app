/**
 * Sheet print — render the whole filtered view to paper.
 *
 * ## Why an iframe and not `window.print()` on the page
 *
 * The page cannot print itself. The grid is virtualized: at any moment about
 * thirty of nine hundred rows exist in the DOM, and `window.print()` would put
 * exactly those thirty on paper with no indication the rest were dropped — a
 * silently wrong document, which is worse than no print button. It also carries
 * the app shell, the sidebar and the toolbar onto the page.
 *
 * So printing builds a **separate document** from the same
 * `SheetDataSource` the clipboard uses: every filtered row, no chrome, no
 * virtualization, and a `<thead>` that repeats on each sheet.
 *
 * A hidden same-origin iframe rather than `window.open`: a popup is blocked by
 * default in Electron and on the kiosk tablets, and a blocked print is a button
 * that does nothing.
 */

/** Escape for interpolation into the print document. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface SheetPrintInput {
  title: string;
  columns: readonly string[];
  rows: readonly (readonly string[])[];
  /** Printed under the title — the filter state the rows are the result of. */
  subtitle?: string;
}

/**
 * Build the print document.
 *
 * Exported separately from {@link printSheet} so the markup is unit-testable
 * without a DOM — the part that can silently produce a wrong document is the
 * markup, not the iframe plumbing.
 */
export function buildSheetPrintDocument({
  title,
  columns,
  rows,
  subtitle,
}: SheetPrintInput): string {
  const head = columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('');
  const body = rows
    .map(
      (row) =>
        `<tr>${columns
          .map((_, i) => `<td>${escapeHtml(row[i] ?? '')}</td>`)
          .join('')}</tr>`,
    )
    .join('');
  const count = `${rows.length.toLocaleString()} ${rows.length === 1 ? 'row' : 'rows'}`;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  /* Landscape by default: an ops queue is wider than it is tall. */
  @page { size: landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font: 11px/1.35 -apple-system, "Segoe UI", system-ui, sans-serif; color: #111; margin: 0; }
  header { margin-bottom: 8px; }
  h1 { font-size: 14px; margin: 0 0 2px; }
  .meta { font-size: 10px; color: #555; }
  table { width: 100%; border-collapse: collapse; }
  /* The header repeats on every sheet — a five-page table whose columns are
     only labelled on page one is unreadable at the bench. */
  thead { display: table-header-group; }
  /* Never split a row across a page break. */
  tr { page-break-inside: avoid; break-inside: avoid; }
  th, td { text-align: left; padding: 3px 6px; vertical-align: top; }
  /* Bottom-only rules — the same hierarchy the airtable skin draws on screen,
     so the printed sheet reads as the same table. No vertical column cage. */
  th { border-bottom: 1px solid #999; font-weight: 600; white-space: nowrap; }
  td { border-bottom: 1px solid #ddd; }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">${escapeHtml(subtitle ? `${subtitle} · ${count}` : count)}</div>
</header>
<table>
<thead><tr>${head}</tr></thead>
<tbody>${body}</tbody>
</table>
</body>
</html>`;
}

/** Render the document into a hidden iframe and open the print dialog. */
export function printSheet(input: SheetPrintInput): void {
  if (typeof document === 'undefined') return;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);

  const cleanup = () => {
    // Deferred: removing the frame inside its own afterprint can abort the job
    // in WebKit.
    window.setTimeout(() => {
      if (frame.parentNode) frame.parentNode.removeChild(frame);
    }, 0);
  };

  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    cleanup();
    return;
  }

  doc.open();
  doc.write(buildSheetPrintDocument(input));
  doc.close();

  win.addEventListener('afterprint', cleanup, { once: true });
  // Wait a frame so layout settles before the dialog samples the document.
  win.requestAnimationFrame(() => {
    win.focus();
    win.print();
    // Some engines never fire `afterprint` (older WebKit, some Electron
    // builds). A long stop keeps the frame from leaking without racing a
    // dialog the operator is still reading.
    window.setTimeout(cleanup, 60_000);
  });
}
