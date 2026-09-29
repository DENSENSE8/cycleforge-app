import assert from 'node:assert/strict';
import test from 'node:test';
import { labelBatchFileName, labelBatchListQuerySchema, labelBatchPageFileName, labelBatchUploadWindow } from './contracts';

test('upload window: a civil day opens at warehouse midnight and closes at the next', () => {
  // PDT (UTC-7).
  assert.deepEqual(labelBatchUploadWindow({ from: '2026-09-28', to: '2026-09-28' }), {
    fromIso: '2026-09-28T07:00:00.000Z',
    toIso: '2026-09-29T07:00:00.000Z',
  });
});

test('upload window: the DST fall-back day is 25 hours long', () => {
  assert.deepEqual(labelBatchUploadWindow({ from: '2026-11-01', to: '2026-11-01' }), {
    fromIso: '2026-11-01T07:00:00.000Z',
    toIso: '2026-11-02T08:00:00.000Z',
  });
});

test('upload window: either side may be open; a reversed pair is swapped', () => {
  assert.deepEqual(labelBatchUploadWindow({ from: '2026-09-28' }), { fromIso: '2026-09-28T07:00:00.000Z', toIso: null });
  assert.deepEqual(labelBatchUploadWindow({ to: '2026-09-28' }), { fromIso: null, toIso: '2026-09-29T07:00:00.000Z' });
  assert.deepEqual(labelBatchUploadWindow({}), { fromIso: null, toIso: null });
  assert.deepEqual(labelBatchUploadWindow({ from: '2026-09-30', to: '2026-09-28' }), labelBatchUploadWindow({ from: '2026-09-28', to: '2026-09-30' }));
});

test('list query: dates must be civil YYYY-MM-DD, blank q is no filter', () => {
  assert.equal(labelBatchListQuerySchema.safeParse({ from: '2026-09-28T00:00:00Z' }).success, false);
  assert.equal(labelBatchListQuerySchema.safeParse({ organizationId: 'x' }).success, false);
  assert.equal(labelBatchListQuerySchema.parse({ q: '   ' }).q, undefined);
});

test('page names: <base>-p<n>.pdf; a one-page PDF keeps its own name', () => {
  assert.equal(labelBatchPageFileName('Labels 09-28.PDF', 2, 3), 'Labels 09-28-p2.pdf');
  assert.equal(labelBatchPageFileName('labels', 10, 12), 'labels-p10.pdf');
  assert.equal(labelBatchPageFileName('Single.pdf', 1, 1), 'Single.pdf');
  assert.equal(labelBatchPageFileName('.pdf', 1, 2), 'labels-p1.pdf');
});

test('page names stay valid ingestion basenames (≤255 chars)', () => {
  const name = labelBatchPageFileName(`${'a'.repeat(260)}.pdf`, 123, 200);
  assert.equal(name.length, 255);
  assert.ok(name.endsWith('-p123.pdf'));
});

test('batch file name: last path segment, trimmed, never empty', () => {
  assert.equal(labelBatchFileName('C:\\scans\\ labels.pdf '), 'labels.pdf');
  assert.equal(labelBatchFileName('a/b/c.pdf'), 'c.pdf');
  assert.equal(labelBatchFileName('   '), 'labels.pdf');
  assert.equal(labelBatchFileName('x'.repeat(300)).length, 255);
});
