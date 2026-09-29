/**
 * Labels & docs › Uploads — the batch family's card model. ONE card per
 * uploaded PDF (a batch): its file name, when it landed, how many of its
 * labels are printed. The chips cut To print (a label never printed) and
 * Printed (every label printed at least once).
 */

import type { RowGroup } from '@/lib/group-rows';
import type { LabelBatchPage, LabelBatchRow } from '@/lib/label-batches/contracts';
import type { DeskDocument } from '@/lib/label-prints/print-labels';
import type { LabelBatchPrintingKey } from '@/lib/triage/views/label-intake';
import { labelDocuments } from './desk-rows';


export interface BatchCardModel {
  key: string;
  ids: number[];
  lead: LabelBatchRow;
  /** Labels never printed. */
  toPrint: number;
}

export const batchRowId = (row: LabelBatchRow) => row.id;
export const batchCardKey = (group: RowGroup<LabelBatchRow>) => group.key;

export function batchPrintingKey(row: LabelBatchRow): LabelBatchPrintingKey {
  return row.printedPages >= row.pageCount ? 'printed' : 'to-print';
}

/** Batches → one card each, in the read's order (newest upload first). */
export function batchBands(rows: readonly LabelBatchRow[]): [string, RowGroup<LabelBatchRow>[]][] {
  return [['batches', rows.map((row) => ({ key: `batch:${row.id}`, rows: [row] }))]];
}

export function batchCardModel(group: RowGroup<LabelBatchRow>): BatchCardModel {
  const lead = group.rows[0]!;
  return { key: group.key, ids: [lead.id], lead, toPrint: Math.max(0, lead.pageCount - lead.printedPages) };
}

/** A Find naming a batch's exact file name opens it. */
export function batchExactFind(query: string, model: BatchCardModel): boolean {
  return model.lead.fileName.toLowerCase() === query;
}

/** A batch's pages as printable labels, page order kept; `onlyUnprinted` skips pages already printed. */
export function batchPageDocuments(pages: readonly LabelBatchPage[], onlyUnprinted: boolean): DeskDocument[] {
  const chosen = (onlyUnprinted ? pages.filter((page) => page.printCount === 0) : [...pages]).sort((a, b) => a.pageNumber - b.pageNumber);
  return labelDocuments(chosen).map((doc, index) => ({
    ...doc,
    // "Page 3" reads better than "USPS label" once the pages of one file sit side by side.
    title: `Page ${chosen[index]!.pageNumber}`,
  }));
}
