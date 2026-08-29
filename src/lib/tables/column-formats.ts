/**
 * Column formatting — the Sheets marks (bold · italic · strike), the two colour
 * channels, and the alignment override, as **pure data plus a class resolver**.
 *
 * Scope is deliberately the COLUMN, not the cell (operator ruling 2026-08-29,
 * `docs/todo/one-sheet-table-sot-PLAN.md` § 3.4). Rows on these surfaces are
 * live orders and receiving lines — they arrive, they ship, they are gone — so a
 * store keyed by row id would grow with the data, add a join to every fetch, and
 * accumulate formatting for rows that no longer exist. A column is stable, there
 * are tens of them per org, and "select cells → press B" reads identically to the
 * operator either way.
 *
 * ## Colours are TOKEN NAMES, never hex
 *
 * `textColor` / `fillColor` store a key of {@link SHEET_TEXT_SWATCHES} /
 * {@link SHEET_FILL_SWATCHES}, resolved to a Tailwind class here. A hex in the
 * column is a bug, not a shortcut: the palette the toolbar offers IS this
 * vocabulary, the API rejects anything outside it, and light/dark stay coherent
 * because the class is a semantic alias rather than a literal.
 *
 * ## Alignment layers, it does not replace
 *
 * `resolveGridColumnAlign` derives alignment from the column `type` (numbers
 * right, text left) and stays the default. A format row's `align` is an operator
 * OVERRIDE on top of it, and clearing the override returns to the derived value
 * — which is why {@link ColumnFormat.align} is nullable rather than defaulted.
 */

/** Marks + colour + alignment for one column of one table, in one org. */
export interface ColumnFormat {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  /** Key of {@link SHEET_TEXT_SWATCHES}, or null for the inherited colour. */
  textColor: string | null;
  /** Key of {@link SHEET_FILL_SWATCHES}, or null for no fill. */
  fillColor: string | null;
  /** Operator override; null → keep the type-derived alignment. */
  align: 'left' | 'center' | 'right' | null;
}

export type ColumnFormatMap = Readonly<Record<string, ColumnFormat>>;

export const EMPTY_COLUMN_FORMAT: ColumnFormat = {
  bold: false,
  italic: false,
  strike: false,
  textColor: null,
  fillColor: null,
  align: null,
};

/**
 * Text swatches — the palette the toolbar's `A▾` offers.
 *
 * Kept small on purpose. A spreadsheet with sixteen text colours communicates
 * nothing; these six map onto the meanings this product already has (default,
 * quiet, and the four status tones), so a coloured column still reads as the
 * same vocabulary as a status chip beside it.
 */
export const SHEET_TEXT_SWATCHES = {
  default: { label: 'Default', className: 'text-text-default', swatch: 'bg-text-default' },
  soft: { label: 'Muted', className: 'text-text-soft', swatch: 'bg-text-soft' },
  accent: { label: 'Accent', className: 'text-text-accent', swatch: 'bg-fill-info' },
  success: { label: 'Success', className: 'text-text-success', swatch: 'bg-fill-success' },
  warning: { label: 'Warning', className: 'text-text-warning', swatch: 'bg-fill-warning' },
  danger: { label: 'Danger', className: 'text-text-danger', swatch: 'bg-fill-danger' },
} as const satisfies Record<string, { label: string; className: string; swatch: string }>;

/**
 * Fill swatches — the toolbar's `▨▾`.
 *
 * Pastel only. A saturated fill behind a whole column would fight the row-fill
 * triage wash (`ledgerRowFillClass`), which is a claim about the ROW's state and
 * outranks a display preference about the column.
 */
export const SHEET_FILL_SWATCHES = {
  none: { label: 'None', className: '', swatch: 'bg-surface-card ring-1 ring-border-soft' },
  subtle: { label: 'Grey', className: 'bg-surface-strong', swatch: 'bg-surface-strong' },
  accent: { label: 'Blue', className: 'bg-surface-accent', swatch: 'bg-surface-accent' },
  success: { label: 'Green', className: 'bg-surface-success', swatch: 'bg-surface-success' },
  warning: { label: 'Amber', className: 'bg-surface-warning', swatch: 'bg-surface-warning' },
  danger: { label: 'Red', className: 'bg-surface-danger', swatch: 'bg-surface-danger' },
} as const satisfies Record<string, { label: string; className: string; swatch: string }>;

export type SheetTextSwatch = keyof typeof SHEET_TEXT_SWATCHES;
export type SheetFillSwatch = keyof typeof SHEET_FILL_SWATCHES;

export const SHEET_TEXT_SWATCH_KEYS = Object.keys(SHEET_TEXT_SWATCHES) as SheetTextSwatch[];
export const SHEET_FILL_SWATCH_KEYS = Object.keys(SHEET_FILL_SWATCHES) as SheetFillSwatch[];

export function isSheetTextSwatch(value: unknown): value is SheetTextSwatch {
  return typeof value === 'string' && value in SHEET_TEXT_SWATCHES;
}

export function isSheetFillSwatch(value: unknown): value is SheetFillSwatch {
  return typeof value === 'string' && value in SHEET_FILL_SWATCHES;
}

/** Marks that carry no visual change — a row worth deleting rather than storing. */
export function isEmptyColumnFormat(format: ColumnFormat): boolean {
  return (
    !format.bold &&
    !format.italic &&
    !format.strike &&
    format.textColor == null &&
    (format.fillColor == null || format.fillColor === 'none') &&
    format.align == null
  );
}

/**
 * Resolve one column's format to the class string its cells apply.
 *
 * Returns `''` for an unformatted column so a caller can `cn(...)` it
 * unconditionally without branching, and so the DOM of an unformatted grid is
 * byte-identical to what it was before this feature existed — which is what
 * keeps the § 7.1 border constraint checkable by diff.
 *
 * Alignment is NOT emitted here. It is resolved into
 * `LedgerGridColumnModel.align` before geometry runs, because the track's
 * justification is a layout fact the header and the body must agree on; a class
 * applied only to cells would leave the header label pointing the other way.
 */
export function columnFormatClass(format: ColumnFormat | undefined): string {
  if (!format) return '';
  const parts: string[] = [];
  if (format.bold) parts.push('font-semibold');
  if (format.italic) parts.push('italic');
  if (format.strike) parts.push('line-through');
  if (format.textColor && isSheetTextSwatch(format.textColor)) {
    parts.push(SHEET_TEXT_SWATCHES[format.textColor].className);
  }
  if (format.fillColor && isSheetFillSwatch(format.fillColor)) {
    const fill = SHEET_FILL_SWATCHES[format.fillColor].className;
    if (fill) parts.push(fill);
  }
  return parts.join(' ');
}

/**
 * Apply a format map's `align` overrides onto a column model.
 *
 * Runs AFTER `resolveGridColumnAlign` has derived the default, so a column with
 * no override keeps exactly the alignment it has today. Identity is preserved
 * when nothing overrides — the same array comes back — so this is safe to call
 * in a `useMemo` without churning the descriptor's dependency.
 */
export function applyColumnFormatAlign<C extends { key: string; align?: 'left' | 'center' | 'right' }>(
  columns: readonly C[],
  formats: ColumnFormatMap | undefined,
): readonly C[] {
  if (!formats) return columns;
  let changed = false;
  const next = columns.map((column) => {
    const override = formats[column.key]?.align;
    if (!override || override === column.align) return column;
    changed = true;
    return { ...column, align: override };
  });
  return changed ? next : columns;
}
