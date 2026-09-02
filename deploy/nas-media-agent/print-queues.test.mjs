/**
 *   node --test deploy/nas-media-agent/print-queues.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePrintQueue, configuredQueueAllowlist } from './print-queues.mjs';

test('resolvePrintQueue: only paper → all types', () => {
  const q = { paper: 'Canon_PRO_200S_series' };
  assert.equal(resolvePrintQueue('shipping_label', q), 'Canon_PRO_200S_series');
  assert.equal(resolvePrintQueue('packing_slip', q), 'Canon_PRO_200S_series');
  assert.equal(resolvePrintQueue('manual', q), 'Canon_PRO_200S_series');
});

test('resolvePrintQueue: only label → all types', () => {
  const q = { label: 'YXWL_CTP800BD' };
  assert.equal(resolvePrintQueue('shipping_label', q), 'YXWL_CTP800BD');
  assert.equal(resolvePrintQueue('packing_slip', q), 'YXWL_CTP800BD');
});

test('resolvePrintQueue: both — label vs paper by type', () => {
  const q = { label: 'YXWL_CTP800BD', paper: 'Canon_PRO_200S_series' };
  assert.equal(resolvePrintQueue('shipping_label', q), 'YXWL_CTP800BD');
  assert.equal(resolvePrintQueue('packing_slip', q), 'Canon_PRO_200S_series');
  assert.equal(resolvePrintQueue('manual', q), 'Canon_PRO_200S_series');
});

test('resolvePrintQueue: nothing configured → null', () => {
  assert.equal(resolvePrintQueue('shipping_label', {}), null);
});

test('configuredQueueAllowlist: dedupes identical label+paper', () => {
  assert.deepEqual(configuredQueueAllowlist({ label: 'A', paper: 'A' }), ['A']);
  assert.deepEqual(configuredQueueAllowlist({ label: 'A', paper: 'B' }), ['A', 'B']);
});
