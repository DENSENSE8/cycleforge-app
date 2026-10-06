import assert from 'node:assert/strict';
import test from 'node:test';
import type { OutboundDocument } from '@/lib/documents/types';
import {
  describeLabelPrint,
  describeScanOut,
  planLabelPrint,
  planScanOut,
  selectedOrderRowIds,
  selectionInStage,
} from './bulk-actions';

const label = (id: number, url = `https://x/label-${id}.pdf`): OutboundDocument =>
  ({ id, documentType: 'shipping_label', data: { url } }) as unknown as OutboundDocument;

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

test('a shared box label prints once; orders without a label are skipped and counted', () => {
  const plan = planLabelPrint([
    { orderRowId: 1, labels: [label(10)] },
    { orderRowId: 2, labels: [label(10)] },
    { orderRowId: 3, labels: [] },
    { orderRowId: 4, labels: null },
    { orderRowId: 5, labels: [label(11, 'https://x/label.png')] },
  ]);
  assert.deepEqual(plan.docs, [
    { id: 10, isPdf: true },
    { id: 11, isPdf: false },
  ]);
  assert.equal(plan.printedOrders, 3);
  assert.equal(plan.skippedNoLabel, 1);
  assert.equal(plan.unreachable, 1);
  assert.deepEqual(describeLabelPrint(plan), {
    ok: true,
    message: 'Printing 2 labels for 3 orders · 1 order skipped — no label bought · 1 order could not be read',
  });
});

test('nothing to print refuses with the reason', () => {
  assert.deepEqual(describeLabelPrint(planLabelPrint([{ orderRowId: 1, labels: null }])), {
    ok: false,
    message: 'Could not read the shipping documents — retry in a moment',
  });
  assert.deepEqual(describeLabelPrint(planLabelPrint([{ orderRowId: 1, labels: [] }])), {
    ok: false,
    message: 'No shipping labels on the selected packages · 1 order skipped — no label bought',
  });
});
