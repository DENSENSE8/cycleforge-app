/** The ONE table serializer — CSV and TSV as a parameter, never two code paths. */

export type ExportFormat = 'csv' | 'tsv';

/** What a row extractor may return for one field. */
export type ExportCell = string | number | boolean | null | undefined;

interface ExportFormatSpec {
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

/** Keyed convenience for the report shapes that carry `{ key, label }` columns (warranty, packing) rather than a positional extractor. */
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
