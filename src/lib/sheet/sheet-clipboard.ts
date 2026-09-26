/** Sheet clipboard — serialise the rows an operator can see into the format a spreadsheet pastes. */

/** A cell's copy value. A column that renders JSX must supply one of these. */
type SheetClipboardValue = string | number | null | undefined;

interface SheetClipboardColumn<Row> {
  key: string;
  /** Header text. Falls back to `key` when a column's label is a glyph. */
  label?: string;
  /** Plain-text value for this cell. */
  copyValue?: (row: Row) => SheetClipboardValue;
}

const TAB = '\t';
const NEWLINE = '\n';

/** Escape one cell for TSV. */
export function escapeTsvCell(value: SheetClipboardValue): string {
  if (value == null) return '';
  return String(value).replace(/[\t\r\n]+/g, ' ').trim();
}

/** Serialise rows × visible columns to TSV, header row first. */
export function toSheetTsv<Row>(
  rows: readonly Row[],
  columns: readonly SheetClipboardColumn<Row>[],
): string {
  if (columns.length === 0) return '';
  const header = columns.map((c) => escapeTsvCell(c.label ?? c.key)).join(TAB);
  const body = rows.map((row) =>
    columns.map((c) => escapeTsvCell(c.copyValue?.(row))).join(TAB),
  );
  return [header, ...body].join(NEWLINE);
}

/** Write text to the clipboard, with a `document.execCommand` fallback. */
async function writeSheetClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through to the legacy path */
    }
  }
  if (typeof document === 'undefined') return false;
  try {
    const area = document.createElement('textarea');
    area.value = text;
    // Off-screen but focusable: `display:none` cannot be selected.
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-9999px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/** "Copied 38 rows" / "Copied 1 row" — the toast text, so it is not re-typed. */
export function sheetCopyToastMessage(rowCount: number): string {
  return `Copied ${rowCount.toLocaleString()} ${rowCount === 1 ? 'row' : 'rows'}`;
}
