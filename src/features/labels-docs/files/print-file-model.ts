/**
 * Labels & docs › Bulk — the file list's pure pieces: what a row says about
 * its file (Printed badge, pages, upload, last print), the day headers the
 * active sort draws, and the documents Print sends for one file (its pages in
 * page order — label pages to the 4×6 station by ingestion, paper pages to
 * the Letter station as packing slips by document).
 */

import type { RecordStateFace } from '@/design-system/tokens/record';
import type { GroupedRenderOrder, RowGroup } from '@/lib/group-rows';
import {
  PRINT_FILE_STATUS_LABEL,
  type PrintFileDetail,
  type PrintFileRow,
  type PrintFileSort,
  type PrintFileUploadResult,
} from '@/lib/label-prints/print-file-contracts';
import type { DeskDocument } from '@/lib/label-prints/print-labels';
import { addDaysToDateKey, formatDateKeyMedium, formatMonthDayTimePST, toPSTDateKey } from '@/utils/date';
import type { PrintedLabelFace } from '../use-desk-press';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The Printed badge: every page printed → Printed; some → Printed x/y; never → none. */
export function printFileBadge(row: Pick<PrintFileRow, 'printedPages' | 'pageCount'>): RecordStateFace | null {
  if (row.printedPages <= 0) return null;
  if (row.printedPages >= row.pageCount) {
    return { id: 'printed', code: 'PRT', label: PRINT_FILE_STATUS_LABEL.printed, tone: 'success', icon: 'check' };
  }
  return { id: 'partly', code: 'PRT', label: `Printed ${row.printedPages}/${row.pageCount}`, tone: 'warning', icon: 'circle-dot' };
}

/** "10 pages · 6 labels · 4 paperwork" — a stock with no pages is left out. */
export function printFilePages(row: Pick<PrintFileRow, 'pageCount' | 'labelPages' | 'paperPages'>): string {
  return [
    plural(row.pageCount, 'page'),
    row.labelPages > 0 ? plural(row.labelPages, 'label') : null,
    row.paperPages > 0 ? `${row.paperPages} paperwork` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** "Oct 6, 2:31 PM · Mike" — when and by whom the file was uploaded. */
export function printFileUploaded(row: Pick<PrintFileRow, 'uploadedAt' | 'uploadedBy'>): string {
  const when = formatMonthDayTimePST(row.uploadedAt);
  return row.uploadedBy ? `${when} · ${row.uploadedBy}` : when;
}

/** "Oct 6, 3:02 PM · Ana" — the last print, or null when never printed. */
export function printFileLastPrint(row: Pick<PrintFileRow, 'lastPrintedAt' | 'lastPrintedBy'>): string | null {
  if (!row.lastPrintedAt) return null;
  const when = formatMonthDayTimePST(row.lastPrintedAt);
  return row.lastPrintedBy ? `${when} · ${row.lastPrintedBy}` : when;
}

/** The band of never-printed files under the Last printed sort — always last. */
export const NOT_PRINTED_BAND = 'not-printed';

/**
 * Day headers follow the active sort's date: the upload day (warehouse civil
 * day) for Newest / Oldest uploaded, the last-printed day for Last printed —
 * never-printed files under "Not printed", last. Rows keep the server's order;
 * a day is one band, in first-seen order.
 */
export function printFileBands(rows: readonly PrintFileRow[], sort: PrintFileSort): GroupedRenderOrder<PrintFileRow> {
  const bands = new Map<string, RowGroup<PrintFileRow>[]>();
  for (const row of rows) {
    const day = sort === 'last-printed' ? (row.lastPrintedAt ? toPSTDateKey(row.lastPrintedAt) : NOT_PRINTED_BAND) : toPSTDateKey(row.uploadedAt);
    const band = bands.get(day) ?? [];
    band.push({ key: printFileKey(row.id), rows: [row] });
    bands.set(day, band);
  }
  const order = [...bands.entries()];
  order.sort(([a], [b]) => Number(a === NOT_PRINTED_BAND) - Number(b === NOT_PRINTED_BAND));
  return order;
}

/** "Today" · "Yesterday" · "Fri, Oct 3" (with the year when it is not this year) · "Not printed". */
export function printFileBandLabel(band: string, today: string): string {
  if (band === NOT_PRINTED_BAND) return PRINT_FILE_STATUS_LABEL['not-printed'];
  if (band === today) return 'Today';
  if (band === addDaysToDateKey(today, -1)) return 'Yesterday';
  return formatDateKeyMedium(band, { withYear: band.slice(0, 4) !== today.slice(0, 4) });
}

/** The card key of one file row. */
export function printFileKey(id: number): string {
  return `file:${id}`;
}

/**
 * One file's pages as desk documents, in page order. A label page logs its
 * print by ingestion (`label_print_events`); a paper page is a packing slip
 * logged by document (`paperwork_print_events`), on its matched order or none.
 */
export function printFileDocuments(file: PrintFileDetail): DeskDocument[] {
  const pages = [...file.pages].sort((a, b) => a.pageNumber - b.pageNumber);
  return pages.flatMap((page): DeskDocument[] => {
    const base = {
      key: `${printFileKey(file.id)}:p${page.pageNumber}`,
      title: `${file.fileName} · p${page.pageNumber}`,
      associationLabel: page.orderRef ? `Order ${page.orderRef}` : null,
      src: page.src,
      orderId: page.orderId,
      manualId: null,
    };
    if (page.stock === 'label') {
      if (page.ingestionId == null && page.documentId == null) return [];
      return [{ ...base, kind: 'label', stock: 'label', ingestionId: page.ingestionId, documentId: page.documentId }];
    }
    if (page.documentId == null) return [];
    return [{ ...base, kind: 'packing_slip', stock: 'paper', ingestionId: null, documentId: page.documentId }];
  });
}

/** What the reprint confirm names for a file: its most-printed page's count and the file's last print. */
export function printFileReprintFace(file: PrintFileDetail): PrintedLabelFace {
  return {
    name: file.fileName,
    printCount: file.pages.reduce((most, page) => Math.max(most, page.printCount), 0),
    lastPrintedAt: file.lastPrintedAt,
    lastPrintedBy: file.lastPrintedBy,
    lastStationName: file.lastStationName,
  };
}

/** What an upload landed as — the toast reads "<name> · <summary>": "6 labels · 4 paperwork · 9 matched", or "already uploaded". */
export function printFileUploadSummary(result: PrintFileUploadResult): { tone: 'success' | 'info' | 'warning'; summary: string } {
  if (result.duplicate) return { tone: 'info', summary: 'already uploaded' };
  const { file, failedPages } = result;
  const parts = [plural(file.labelPages, 'label'), `${file.paperPages} paperwork`, `${file.matchedPages} matched`];
  const first = failedPages[0];
  if (first) parts.push(`${plural(failedPages.length, 'page')} not stored — p${first.pageNumber}: ${first.reason}`);
  return { tone: first ? 'warning' : 'success', summary: parts.join(' · ') };
}
