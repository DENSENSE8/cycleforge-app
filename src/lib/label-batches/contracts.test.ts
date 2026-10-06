import assert from 'node:assert/strict';
import test from 'node:test';
import { labelBatchFileName, labelBatchPageFileName, labelBatchUploadFieldsSchema, warehouseDayWindow } from './contracts';

test('day window: a civil day opens at warehouse midnight and closes at the next', () => {
  // PDT (UTC-7).
  assert.deepEqual(warehouseDayWindow({ from: '2026-09-28', to: '2026-09-28' }), {
    fromIso: '2026-09-28T07:00:00.000Z',
    toIso: '2026-09-29T07:00:00.000Z',
  });
});

test('day window: the DST fall-back day is 25 hours long', () => {
  assert.deepEqual(warehouseDayWindow({ from: '2026-11-01', to: '2026-11-01' }), {
    fromIso: '2026-11-01T07:00:00.000Z',
    toIso: '2026-11-02T08:00:00.000Z',
  });
});

test('day window: either side may be open; a reversed pair is swapped', () => {
  assert.deepEqual(warehouseDayWindow({ from: '2026-09-28' }), { fromIso: '2026-09-28T07:00:00.000Z', toIso: null });
  assert.deepEqual(warehouseDayWindow({ to: '2026-09-28' }), { fromIso: null, toIso: '2026-09-29T07:00:00.000Z' });
  assert.deepEqual(warehouseDayWindow({}), { fromIso: null, toIso: null });
  assert.deepEqual(warehouseDayWindow({ from: '2026-09-30', to: '2026-09-28' }), warehouseDayWindow({ from: '2026-09-28', to: '2026-09-30' }));
});

test('upload fields: a client event id, and only `stock=label` as the override', () => {
  const clientEventId = '7d1c1f8e-2c3a-4b5d-8e9f-0a1b2c3d4e5f';
  assert.ok(labelBatchUploadFieldsSchema.safeParse({ clientEventId }).success);
  assert.ok(labelBatchUploadFieldsSchema.safeParse({ clientEventId, stock: 'label' }).success);
  assert.equal(labelBatchUploadFieldsSchema.safeParse({ clientEventId, stock: 'paper' }).success, false);
  assert.equal(labelBatchUploadFieldsSchema.safeParse({ clientEventId, organizationId: 'x' }).success, false);
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
