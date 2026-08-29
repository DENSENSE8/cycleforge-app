/**
 * Sheet clipboard — serialise the rows an operator can see into the format a
 * spreadsheet pastes.
 *
 * ## Why TSV and not CSV
 *
 * Google Sheets, Excel and Numbers all read tab-separated text off the clipboard
 * as a *grid* and comma-separated text as a *single column of strings*. An
 * operator who copies 200 orders and pastes them into a sheet wants 200 rows by
 * N columns, so the delimiter is a tab. CSV stays the EXPORT format (a file has
 * no such convention, and `.csv` is what a mail merge / accounting import wants)
 * — the two verbs are deliberately different, and this is why.
 *
 * ## What gets copied
 *
 * The **filtered rows** and the **visible columns**, in their on-screen order —
 * not the underlying collection. Copying what is on screen is the only rule an
 * operator can predict: they filtered to 38 stuck units, so 38 rows land in the
 * sheet. Copying the unfiltered set would silently paste 922.
 *
 * Everything here is pure so it can be unit-tested without a clipboard; the
 * browser write lives in {@link writeSheetClipboard}.
 */

/** A cell's copy value. A column that renders JSX must supply one of these. */
export type SheetClipboardValue = string | number | null | undefined;

export interface SheetClipboardColumn<Row> {
  key: string;
  /** Header text. Falls back to `key` when a column's label is a glyph. */
  label?: string;
  /**
   * Plain-text value for this cell.
   *
   * A cell is domain JSX — a status chip, a copy chip, a two-line identity — so
   * the grid cannot derive text from it, and scraping `textContent` off the DOM
   * would copy whatever the virtualizer happens to have mounted. The column
   * declares its own text, or it is copied as empty.
   */
  copyValue?: (row: Row) => SheetClipboardValue;
}

const TAB = '\t';
const NEWLINE = '\n';

/**
 * Escape one cell for TSV.
 *
 * Tabs and newlines inside a value would forge extra cells and rows, which is
 * the one way a copy can silently corrupt the operator's sheet. Both collapse to
 * a single space rather than being quoted: TSV has no agreed quoting convention
 * (unlike CSV), and every consumer we care about treats a quote as a literal
 * character.
 */
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

/**
 * Write text to the clipboard, with a `document.execCommand` fallback.
 *
 * The async Clipboard API is unavailable on insecure origins and inside some
 * embedded webviews — and this app ships in Electron and on kiosk tablets, so
 * that is not a hypothetical. Returns whether the write landed so the caller can
 * tell the operator the truth instead of firing an unconditional "Copied" toast.
 */
export async function writeSheetClipboard(text: string): Promise<boolean> {
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
