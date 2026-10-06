import assert from 'node:assert/strict';
import test from 'node:test';
import { labelPrintRecordBodySchema, paperworkPrintRecordBodySchema } from './contracts';

const batch = { batchId: '7d1c1f8e-2c3a-4b5d-8e9f-0a1b2c3d4e5f', channel: 'BROWSER_DIALOG' } as const;

test('label print body: ingestions and/or documents, at least one, unique, capped in total', () => {
  assert.ok(labelPrintRecordBodySchema.safeParse({ ...batch, ingestionIds: [1, 2] }).success);
  assert.ok(labelPrintRecordBodySchema.safeParse({ ...batch, documentIds: [1066] }).success);
  assert.ok(labelPrintRecordBodySchema.safeParse({ ...batch, ingestionIds: [50], documentIds: [] }).success);
  assert.equal(labelPrintRecordBodySchema.safeParse({ ...batch }).success, false);
  assert.equal(labelPrintRecordBodySchema.safeParse({ ...batch, ingestionIds: [], documentIds: [] }).success, false);
  assert.equal(labelPrintRecordBodySchema.safeParse({ ...batch, documentIds: [3, 3] }).success, false);
  const ids = (n: number, from: number) => Array.from({ length: n }, (_, i) => from + i);
  assert.equal(labelPrintRecordBodySchema.safeParse({ ...batch, ingestionIds: ids(300, 1), documentIds: ids(201, 1) }).success, false);
});

test('paperwork print body: an unpaired packing slip may omit its order; a manual may not', () => {
  assert.ok(paperworkPrintRecordBodySchema.safeParse({ ...batch, items: [{ orderId: null, kind: 'packing_slip', documentId: 88 }] }).success);
  assert.ok(paperworkPrintRecordBodySchema.safeParse({ ...batch, items: [{ orderId: 7, kind: 'manual', manualId: 4 }] }).success);
  assert.equal(paperworkPrintRecordBodySchema.safeParse({ ...batch, items: [{ orderId: null, kind: 'manual', manualId: 4 }] }).success, false);
  assert.equal(paperworkPrintRecordBodySchema.safeParse({ ...batch, items: [{ orderId: null, kind: 'packing_slip' }] }).success, false);
});
