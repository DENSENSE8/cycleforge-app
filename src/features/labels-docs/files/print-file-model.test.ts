import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrintFileDetail, PrintFileRow } from '@/lib/label-prints/print-file-contracts';
import {
  NOT_PRINTED_BAND,
  printFileBadge,
  printFileBandLabel,
  printFileBands,
  printFileDocuments,
  printFilePages,
  printFileUploadSummary,
} from './print-file-model';

function row(id: number, patch: Partial<PrintFileRow> = {}): PrintFileRow {
  return {
    id,
    fileName: `batch-${id}.pdf`,
    pageCount: 10,
    labelPages: 6,
    paperPages: 4,
    byteSize: 1000,
    uploadedAt: '2026-10-06T18:00:00Z',
    uploadedBy: 'Mike',
    printedPages: 0,
    lastPrintedAt: null,
    lastPrintedBy: null,
    lastStationName: null,
    matchedPages: 0,
    src: `/files/${id}.pdf`,
    ...patch,
  };
}

test('the Printed badge: none when never printed, Printed x/y when partial, Printed when every page printed', () => {
  assert.equal(printFileBadge(row(1)), null);
  assert.equal(printFileBadge(row(1, { printedPages: 6 }))?.label, 'Printed 6/10');
  assert.equal(printFileBadge(row(1, { printedPages: 10 }))?.label, 'Printed');
});

test('the pages line leaves out a stock with no pages', () => {
  assert.equal(printFilePages(row(1)), '10 pages · 6 labels · 4 paperwork');
  assert.equal(printFilePages(row(1, { pageCount: 1, labelPages: 1, paperPages: 0 })), '1 page · 1 label');
});

test('upload sorts band by the upload day (warehouse civil day), in server order', () => {
  const rows = [
    row(3, { uploadedAt: '2026-10-06T18:00:00Z' }),
    // 02:00 UTC on Oct 6 is still Oct 5 in Los Angeles.
    row(2, { uploadedAt: '2026-10-06T02:00:00Z' }),
    row(1, { uploadedAt: '2026-10-04T18:00:00Z' }),
  ];
  const bands = printFileBands(rows, 'newest');
  assert.deepEqual(
    bands.map(([band, groups]) => [band, groups.map((group) => group.rows[0]!.id)]),
    [
      ['2026-10-06', [3]],
      ['2026-10-05', [2]],
      ['2026-10-04', [1]],
    ],
  );
});

test('Last printed bands by the last-printed day, never-printed files last under Not printed', () => {
  const rows = [
    row(5, { lastPrintedAt: '2026-10-06T18:00:00Z', printedPages: 10 }),
    row(4),
    row(3, { lastPrintedAt: '2026-10-03T18:00:00Z', printedPages: 2 }),
  ];
  const bands = printFileBands(rows, 'last-printed');
  assert.deepEqual(
    bands.map(([band, groups]) => [band, groups.map((group) => group.rows[0]!.id)]),
    [
      ['2026-10-06', [5]],
      ['2026-10-03', [3]],
      [NOT_PRINTED_BAND, [4]],
    ],
  );
});

test('band labels: Today, Yesterday, a weekday date, the year only when it differs, Not printed', () => {
  assert.equal(printFileBandLabel('2026-10-06', '2026-10-06'), 'Today');
  assert.equal(printFileBandLabel('2026-10-05', '2026-10-06'), 'Yesterday');
  assert.equal(printFileBandLabel('2026-10-02', '2026-10-06'), 'Fri, Oct 2');
  assert.equal(printFileBandLabel('2025-12-31', '2026-10-06'), 'Wed, Dec 31, 2025');
  assert.equal(printFileBandLabel(NOT_PRINTED_BAND, '2026-10-06'), 'Not printed');
});

test('a file prints its pages in page order: labels by ingestion, paper as packing slips by document', () => {
  const detail: PrintFileDetail = {
    ...row(7, { pageCount: 3, labelPages: 2, paperPages: 1 }),
    pages: [
      { pageNumber: 3, stock: 'label', ingestionId: 31, documentId: null, src: '/p3', orderId: null, orderRef: null, match: 'unmatched', printCount: 0, lastPrintedAt: null },
      { pageNumber: 1, stock: 'label', ingestionId: 30, documentId: 900, src: '/p1', orderId: 12, orderRef: '100612', match: 'matched', printCount: 1, lastPrintedAt: null },
      { pageNumber: 2, stock: 'paper', ingestionId: null, documentId: 901, src: '/p2', orderId: 12, orderRef: '100612', match: 'matched', printCount: 0, lastPrintedAt: null },
    ],
  };
  const docs = printFileDocuments(detail);
  assert.deepEqual(
    docs.map((doc) => [doc.kind, doc.stock, doc.ingestionId, doc.documentId, doc.orderId]),
    [
      ['label', 'label', 30, 900, 12],
      ['packing_slip', 'paper', null, 901, 12],
      ['label', 'label', 31, null, null],
    ],
  );
  assert.equal(new Set(docs.map((doc) => doc.key)).size, 3);
});

test('the upload summary names what landed, or that the file was already uploaded', () => {
  const file = row(1, { labelPages: 6, paperPages: 4, matchedPages: 9 });
  assert.deepEqual(printFileUploadSummary({ file, duplicate: false, failedPages: [] }), {
    tone: 'success',
    summary: '6 labels · 4 paperwork · 9 matched',
  });
  assert.deepEqual(printFileUploadSummary({ file, duplicate: true, failedPages: [] }), { tone: 'info', summary: 'already uploaded' });
  assert.equal(printFileUploadSummary({ file, duplicate: false, failedPages: [{ pageNumber: 4, reason: 'unreadable' }] }).tone, 'warning');
});
