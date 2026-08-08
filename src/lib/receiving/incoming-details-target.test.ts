import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { incomingDetailsTargetFromRow } from './incoming-details-target';

function row(partial: Partial<ReceivingLineRow> & { id: number }): ReceivingLineRow {
  return {
    receiving_id: null,
    tracking_number: null,
    carrier: null,
    zoho_item_id: null,
    zoho_line_item_id: null,
    zoho_purchase_receive_id: null,
    zoho_purchaseorder_id: null,
    zoho_purchaseorder_number: null,
    item_name: null,
    sku: null,
    quantity_received: 0,
    quantity_expected: null,
    qa_status: '',
    workflow_status: null,
    disposition_code: '',
    condition_grade: '',
    disposition_audit: [],
    needs_test: false,
    assigned_tech_id: null,
    zoho_sync_source: null,
    zoho_last_modified_time: null,
    zoho_synced_at: null,
    receiving_type: null,
    ...partial,
  } as ReceivingLineRow;
}

test('PO-anchored row opens with poId', () => {
  const resolved = incomingDetailsTargetFromRow(
    row({
      id: 1,
      zoho_purchaseorder_id: 'po-99',
      zoho_purchaseorder_number: '6001',
      receiving_id: 10,
    }),
  );
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.target.poId, 'po-99');
  assert.equal(resolved.target.receivingId, 10);
  assert.equal(resolved.target.seedRow?.id, 1);
});

test('carton-anchored empty PO opens for Pairing (no toast)', () => {
  const resolved = incomingDetailsTargetFromRow(
    row({
      id: 2,
      receiving_id: 44,
      tracking_number: '1Z999',
    }),
  );
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.target.poId, null);
  assert.equal(resolved.target.receivingId, 44);
  assert.equal(resolved.target.shipmentId, null);
});

test('no PO, shipment, inbound, or carton → blocked with toast', () => {
  const resolved = incomingDetailsTargetFromRow(
    row({ id: 3, tracking_number: '1Z111' }),
  );
  assert.equal(resolved.ok, false);
  if (resolved.ok) return;
  assert.match(resolved.toast, /not linked to a PO/i);
});
