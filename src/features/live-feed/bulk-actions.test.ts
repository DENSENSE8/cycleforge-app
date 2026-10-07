import assert from 'node:assert/strict';
import test from 'node:test';
import {
  removableOrderRowIds,
  describeScanOut,
  planScanOut,
  selectedOrderRowIds,
  selectionInStage,
} from './bulk-actions';

test('selectedOrderRowIds keeps selection order and drops repeats', () => {
  assert.deepEqual(selectedOrderRowIds([{ orderRowId: 3 }, { orderRowId: 1 }, { orderRowId: 3 }]), [3, 1]);
});

test('a stage-bound verb shows only when every selected package is in that stage', () => {
  assert.equal(selectionInStage([{ stage: 'to_pick' }, { stage: 'to_pick' }], 'to_pick'), true);
  assert.equal(selectionInStage([{ stage: 'to_pick' }, { stage: 'picked' }], 'to_pick'), false);
  assert.equal(selectionInStage([{ stage: 'packed' }], 'to_pick'), false);
  assert.equal(selectionInStage([{ stage: 'packed' }, { stage: 'packed' }], 'packed'), true);
  assert.equal(selectionInStage([{ stage: 'packed' }, { stage: 'scanned_out' }], 'packed'), false);
  assert.equal(selectionInStage([], 'packed'), false);
});

test('scan-out sends one label per box and counts packages without one', () => {
  const plan = planScanOut([
    { shipmentId: 7, tracking: '1Z1' },
    { shipmentId: 7, tracking: '1Z1' },
    { shipmentId: 8, tracking: ' 9400 ' },
    { shipmentId: null, tracking: null },
  ]);
  assert.deepEqual(plan, { labels: ['1Z1', '9400'], unlabeled: 1 });
});

test('a scan-out run reports refusals, repeats and failures without hiding the boxes that left', () => {
  const sent = { ok: true, matched: true };
  assert.deepEqual(
    describeScanOut([sent, { ok: true, matched: true, duplicate: true }, { ok: true, matched: true, blocked: true }, null], 0),
    { ok: true, message: 'Scanned out 1 box · 1 box already scanned out · 1 box refused — not packed or cancelled · 1 box failed — retry' },
  );
  assert.equal(describeScanOut([{ ok: true, matched: false }], 0).ok, false);
  assert.equal(describeScanOut([], 2).message, '2 packages skipped — no label');
});

test('an unlinked scan-out (no order) never joins an order write', () => {
  assert.deepEqual(
    selectedOrderRowIds([
      { orderRowId: 3, link: 'order' },
      { orderRowId: -182938, link: 'package' },
      { orderRowId: -1000000042, link: 'scan' },
    ]),
    [3],
  );
});

test('Remove from list takes only order cards still in the building', () => {
  assert.deepEqual(
    removableOrderRowIds([
      { orderRowId: 3, link: 'order', stage: 'packed' },
      { orderRowId: 4, link: 'order', stage: 'scanned_out' },
      { orderRowId: -182938, link: 'package', stage: 'scanned_out' },
      { orderRowId: 3, link: 'order', stage: 'packed' },
      { orderRowId: 5, link: 'order', stage: 'to_pick' },
    ]),
    [3, 5],
  );
});
