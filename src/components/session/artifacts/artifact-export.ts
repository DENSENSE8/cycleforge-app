/**
 * Taking a result out of the chat — one implementation for the inline table's
 * controls and the side panel's header actions. A table copies as TSV (pastes
 * into a spreadsheet as cells) or downloads as CSV; a record copies as
 * `label: value` lines.
 */

import { writeClipboardText } from '@/lib/clipboard';
import { downloadExport } from '@/lib/tables/export/download';
import { serializeRows } from '@/lib/tables/export/serialize';
import { toast } from '@/lib/toast';
import type { ArtifactRecord, ArtifactTable } from '@/lib/assistant/ui-artifacts';

export type ExportableArtifact = ArtifactTable | ArtifactRecord;

/** Copy to the clipboard with a receipt toast; false when the browser blocked it. */
export function copyArtifact(artifact: ExportableArtifact): boolean {
  const text =
    artifact.kind === 'table'
      ? serializeRows(artifact.columns, artifact.rows.map((row) => artifact.columns.map((c) => row[c])), 'tsv')
      : artifact.fields.map((f) => `${f.label}: ${f.value}`).join('\n');
  const ok = writeClipboardText(text);
  if (!ok) toast.error('Copy failed — the browser blocked the clipboard');
  else if (artifact.kind === 'table') toast.success(`Copied ${artifact.rows.length} ${artifact.rows.length === 1 ? 'row' : 'rows'}`);
  else toast.success('Copied record');
  return ok;
}

/** Download a table as CSV, named after its title; false when the browser refused. */
export function downloadTableCsv(artifact: ArtifactTable): boolean {
  try {
    downloadExport(artifact.columns, artifact.rows.map((row) => artifact.columns.map((c) => row[c])), artifact.title || 'table', 'csv');
    return true;
  } catch {
    toast.error('Download failed');
    return false;
  }
}
