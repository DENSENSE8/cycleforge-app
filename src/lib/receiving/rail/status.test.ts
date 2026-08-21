import test from 'node:test';
import assert from 'node:assert/strict';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import {
  getReceivingStatusBadgeClass,
  getReceivingStatusDot,
  getReceivingStatusDotLabel,
  getReceivingStatusDotTip,
  getReceivingStatusPillClass,
  getUnboxRecentStatusDot,
  getUnboxRecentStatusDotLabel,
  receivingCoarseStatusPaint,
} from './status';

function row(overrides: Partial<ReceivingLineRow> = {}): ReceivingLineRow {
  return {
    id: 1,
    receiving_id: 10,
    tracking_number: '1Z999',
    carrier: 'UPS',
    zoho_item_id: null,
    zoho_line_item_id: null,
    zoho_purchase_receive_id: null,
    zoho_purchaseorder_id: 'PO-1',
    zoho_purchaseorder_number: 'PO-1',
    item_name: 'Widget',
    sku: 'WDG',
    quantity_received: 0,
    quantity_expected: 1,
    qa_status: 'PENDING',
    workflow_status: 'MATCHED',
    disposition_code: 'HOLD',
    condition_grade: 'BRAND_NEW',
    disposition_audit: [],
    needs_test: true,
    assigned_tech_id: null,
    zoho_sync_source: null,
    zoho_last_modified_time: null,
    zoho_synced_at: null,
    receiving_type: 'PO',
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    receiving_source: 'po',
    ...overrides,
  };
}

test('getReceivingStatusDotLabel — door-scanned matched carton reads Scanned', () => {
  const r = row({ workflow_status: 'MATCHED', quantity_received: 0 });
  assert.equal(getReceivingStatusDotLabel(r), 'Scanned');
  assert.ok(getReceivingStatusDot(r).includes('blue') || getReceivingStatusDot(r).includes('sky'));
});

test('getReceivingStatusDotLabel — Zoho issued + local DONE reads Received; tip is the pending provider write', () => {
  const r = row({
    workflow_status: 'DONE',
    zoho_status: 'issued',
    zoho_purchaseorder_id: 'PO-1',
    quantity_received: 1,
  });
  assert.equal(getReceivingStatusDotLabel(r), 'Received');
  assert.equal(getReceivingStatusDot(r), 'bg-emerald-500');
  assert.equal(getReceivingStatusDotTip(r, 'Zoho Inventory'), 'Awaiting confirmation in Zoho Inventory');
});

test('getReceivingStatusDotLabel — Zoho received + local DONE still reads Received', () => {
  const r = row({
    workflow_status: 'DONE',
    zoho_status: 'received',
    zoho_purchaseorder_id: 'PO-1',
    quantity_received: 1,
  });
  assert.equal(getReceivingStatusDotLabel(r), 'Received');
  assert.equal(getReceivingStatusDot(r), 'bg-emerald-500');
});

test('getReceivingStatusPillClass — tracks the same coarse stage as the rail dot', () => {
  assert.match(
    getReceivingStatusPillClass(row({ workflow_status: 'MATCHED' })),
    /border-blue-200/,
  );
  assert.match(
    getReceivingStatusPillClass(row({ workflow_status: 'UNBOXED' })),
    /border-indigo-200/,
  );
  assert.match(
    getReceivingStatusPillClass(row({ workflow_status: 'DONE' })),
    /border-emerald-200/,
  );
});

test('getUnboxRecentStatusDot — matched-but-not-unboxed carton reads Scanned', () => {
  const r = row({ workflow_status: 'MATCHED', quantity_received: 0 });
  assert.equal(getUnboxRecentStatusDotLabel(r), 'Scanned');
  assert.equal(getUnboxRecentStatusDot(r), 'bg-blue-500');
});

test('getUnboxRecentStatusDot — UNBOXED carton reads Unboxed (indigo), not Received', () => {
  const r = row({ workflow_status: 'UNBOXED', quantity_received: 0 });
  assert.equal(getUnboxRecentStatusDotLabel(r), 'Unboxed');
  assert.equal(getUnboxRecentStatusDot(r), 'bg-indigo-500');
});

test('getUnboxRecentStatusDot — unfound carton, unboxed locally, reads Received', () => {
  const r = row({
    receiving_source: 'unmatched',
    workflow_status: 'ARRIVED',
    quantity_received: 0,
    unboxed_at: '2026-01-02T00:00:00Z',
    zoho_purchaseorder_id: null,
  });
  assert.equal(getUnboxRecentStatusDotLabel(r), 'Received');
  assert.equal(getUnboxRecentStatusDot(r), 'bg-emerald-500');
});

test('getUnboxRecentStatusDot — testing phase reads Received (emerald)', () => {
  const r = row({ workflow_status: 'IN_TEST' });
  assert.equal(getUnboxRecentStatusDot(r), 'bg-emerald-500');
  assert.equal(getUnboxRecentStatusDotLabel(r), 'Received');
});

test('getReceivingStatusDotTip — UNBOXED names inventory provider', () => {
  const r = row({ workflow_status: 'UNBOXED', quantity_received: 1 });
  assert.equal(
    getReceivingStatusDotTip(r, 'Zoho Inventory'),
    'Awaiting confirmation in Zoho Inventory',
  );
  assert.equal(getReceivingStatusDotLabel(r), 'Unboxed');
});

test('getReceivingStatusDotTip — DONE / MATCHED without a provider status → null (short label stays)', () => {
  assert.equal(getReceivingStatusDotTip(row({ workflow_status: 'DONE' }), 'Zoho Inventory'), null);
  assert.equal(getReceivingStatusDotTip(row({ workflow_status: 'MATCHED' }), 'Zoho Inventory'), null);
});

test('getReceivingStatusBadgeClass — FAILED / AWAITING_TEST → Received emerald chip', () => {
  for (const workflow_status of ['FAILED', 'AWAITING_TEST'] as const) {
    const r = row({ workflow_status });
    assert.equal(getReceivingStatusDotLabel(r), 'Received');
    assert.equal(getReceivingStatusDot(r), 'bg-emerald-500');
    assert.match(getReceivingStatusBadgeClass(r), /bg-emerald-50/);
    assert.match(getReceivingStatusBadgeClass(r), /text-emerald-700/);
  }
});

test('getReceivingStatusBadgeClass — UNBOXED stays Unboxed indigo (not Received)', () => {
  const r = row({ workflow_status: 'UNBOXED', quantity_received: 1 });
  assert.equal(getReceivingStatusDotLabel(r), 'Unboxed');
  assert.equal(getReceivingStatusDot(r), 'bg-indigo-500');
  assert.match(getReceivingStatusBadgeClass(r), /bg-indigo-50/);
});

test('receivingCoarseStatusPaint — testing terminals collapse; UNBOXED keeps sync tip', () => {
  const failed = receivingCoarseStatusPaint(row({ workflow_status: 'FAILED' }), 'Zoho Inventory');
  assert.equal(failed.label, 'Received');
  assert.equal(failed.tip, null);
  assert.match(failed.badge, /emerald/);

  const unboxed = receivingCoarseStatusPaint(
    row({ workflow_status: 'UNBOXED', quantity_received: 1 }),
    'Zoho Inventory',
  );
  assert.equal(unboxed.label, 'Unboxed');
  assert.equal(unboxed.tip, 'Awaiting confirmation in Zoho Inventory');

  const localDoneProviderOpen = receivingCoarseStatusPaint(
    row({
      workflow_status: 'DONE',
      zoho_status: 'issued',
      zoho_purchaseorder_id: 'PO-1',
      quantity_received: 1,
    }),
    'Zoho Inventory',
  );
  assert.equal(localDoneProviderOpen.label, 'Received');
  assert.equal(localDoneProviderOpen.tip, 'Awaiting confirmation in Zoho Inventory');
});
