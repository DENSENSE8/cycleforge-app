/**
 * The ONE table serializer — CSV and TSV as a parameter, never two code paths.
 *
 * The repo had three hand-written `csvCell` functions (`DataTable`,
 * `lib/warranty/reports`, `lib/dashboard/order-export-csv`) plus a private
 * `toTsv` for the clipboard. They agreed — which is the point: three copies that
 * agree today are three copies, and the next quoting fix lands in one of them.
 *
 * ## Format is a radio, not a fork
 *
 * The plan's line, and it is load-bearing. A `toTsv` that lives beside `toCsv`
 * is a second serializer with its own escaping rules, and the moment one learns
 * about a BOM or a ` ` the other does not. Here the only difference is a
 * delimiter and how a cell that contains one is made safe.
 *
 * ## Why the two formats escape differently
 *
 * CSV is a FILE, and RFC 4180 quoting is lossless: a comma, a quote or a
 * newline inside a product title survives the round trip. TSV is the CLIPBOARD
 * shape a spreadsheet expects on paste, and spreadsheets do not read quoted
 * TSV — so a tab or a newline in a value has to be flattened to a space or it
 * silently becomes a new column or a new row. Losing a line break on paste is
 * the correct trade; inventing a column is not.
 *
 * Pure and dependency-free: no DOM, no fetch. The download half lives with the
 * control that triggers it.
 */

export type ExportFormat = 'csv' | 'tsv';

/** What a row extractor may return for one field. */
export type ExportCell = string | number | boolean | null | undefined;

export interface ExportFormatSpec {
  /** File extension, without the dot. */
  extension: string;
  /** MIME type for the Blob. */
  mime: string;
  label: string;
}

export const EXPORT_FORMATS: Readonly<Record<ExportFormat, ExportFormatSpec>> = {
  csv: { extension: 'csv', mime: 'text/csv;charset=utf-8;', label: 'CSV' },
  tsv: { extension: 'tsv', mime: 'text/tab-separated-values;charset=utf-8;', label: 'TSV' },
};

/** `true` / `false` rather than `TRUE` / `1` — the shape every importer reads. */
function stringify(value: ExportCell): string {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

/** RFC-4180: quote when the value could otherwise break the row or the column. */
export function csvCell(value: ExportCell): string {
  const raw = stringify(value);
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

/** Flatten — a spreadsheet does not read quoted TSV off the clipboard. */
export function tsvCell(value: ExportCell): string {
  return stringify(value).replace(/[\t\r\n]+/g, ' ');
}

export function serializeRows(
  header: readonly string[],
  rows: Iterable<readonly ExportCell[]>,
  format: ExportFormat = 'csv',
): string {
  const cell = format === 'tsv' ? tsvCell : csvCell;
  const delimiter = format === 'tsv' ? '\t' : ',';
  // CRLF for CSV (RFC 4180, and what Excel expects from a file); LF for the
  // clipboard, where a stray CR shows up as a blank row on paste.
  const terminator = format === 'tsv' ? '\n' : '\r\n';

  const out: string[] = [header.map(cell).join(delimiter)];
  for (const row of rows) out.push(row.map(cell).join(delimiter));
  return out.join(terminator);
}

/**
 * Keyed convenience for the report shapes that carry `{ key, label }` columns
 * (warranty, packing) rather than a positional extractor.
 *
 * Same serializer underneath — this only maps records to arrays, so a report
 * and a desk export cannot disagree about quoting.
 */
export function serializeRecords<T>(
  rows: readonly T[],
  columns: readonly { key: keyof T; label: string }[],
  format: ExportFormat = 'csv',
): string {
  return serializeRows(
    columns.map((c) => c.label),
    rows.map((row) => columns.map((c) => row[c.key] as ExportCell)),
    format,
  );
}

/** `to-ship.csv` — the lane, then the format's own extension. */
export function exportFilename(base: string, format: ExportFormat): string {
  const stem = base.replace(/\.(csv|tsv)$/i, '');
  return `${stem}.${EXPORT_FORMATS[format].extension}`;
}
