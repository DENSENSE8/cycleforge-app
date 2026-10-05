import assert from 'node:assert/strict';
import test from 'node:test';
import type { OutboundDocument } from '@/lib/documents/types';
import { canAssignPicker, describeLabelPrint, planLabelPrint, selectedOrderRowIds } from './bulk-actions';

const label = (id: number, url = `https://x/label-${id}.pdf`): OutboundDocument =>
  ({ id, documentType: 'shipping_label', data: { url } }) as unknown as OutboundDocument;

test('selectedOrderRowIds keeps selection order and drops repeats', () => {
  assert.deepEqual(selectedOrderRowIds([{ orderRowId: 3 }, { orderRowId: 1 }, { orderRowId: 3 }]), [3, 1]);
});

test('Assign picker is offered only when every selected package is To pick', () => {
  assert.equal(canAssignPicker([{ stage: 'to_pick' }, { stage: 'to_pick' }]), true);
  assert.equal(canAssignPicker([{ stage: 'to_pick' }, { stage: 'picked' }]), false);
  assert.equal(canAssignPicker([{ stage: 'packed' }]), false);
  assert.equal(canAssignPicker([]), false);
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
