/** Build an export file and hand it to the browser — the one DOM step of table export. */

import { EXPORT_FORMATS, exportFilename, serializeRows, type ExportCell, type ExportFormat } from './serialize';

export function downloadExport(
  header: readonly string[],
  rows: Iterable<readonly ExportCell[]>,
  base: string,
  format: ExportFormat,
): void {
  const text = serializeRows(header, rows, format);
  const url = URL.createObjectURL(new Blob([text], { type: EXPORT_FORMATS[format].mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = exportFilename(base, format);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
