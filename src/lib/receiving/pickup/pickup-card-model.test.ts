import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PickupLine } from './pickup-lines';
import { pickupBands } from '@/components/receiving/pickup/PickupWorkspace';
import { pickupCardModel, pickupOrderRecords, pickupRecordCard } from './pickup-card-model';

function line(patch: Partial<PickupLine> = {}): PickupLine {
  return {
    id: 1,
    order_id: 41,
    sku: 'BOSE-251-BLK',
    product_title: 'Bose 251 black speaker',
    image_url: null,
    quantity: 1,
    condition_grade: 'USED_GOOD',
    parts_status: 'COMPLETE',
    missing_parts_note: null,
    condition_note: null,
    total_price: '370.00',
    po_number: 'LCPU-JOAQUIN-012926',
    reference_number: 'PICKUP-41',
    customer_name: 'Joaquin',
    order_status: 'DRAFT',
    receiving_id: null,
    pickup_date: '2026-01-28',
    order_created_at: '2026-01-28T18:00:00.000Z',
    zoho_po_id: null,
    zoho_status: null,
    zoho_total: null,
    zoho_po_date: null,
    zoho_vendor_name: null,
    ...patch,
  };
}

test('a Local Pickup order becomes one expandable card with all item lines', () => {
  const rows = [line(), line({ id: 2, sku: 'REMOTE-V20', product_title: 'Remote V20 V10', total_price: '75.00' })];
  const model = pickupCardModel({ key: 'pickup:41', rows: pickupOrderRecords(rows) });
  const card = pickupRecordCard(model);

  assert.equal(model.identity, 'LCPU-JOAQUIN-012926');
  assert.equal(model.itemCount, 2);
  assert.equal(model.totalValue, 445);
  assert.equal(model.state.id, 'PROCESS');
  assert.deepEqual(model.ids, [41]);
  assert.equal(card.lines.length, 2);
  assert.equal(card.next?.label, 'Process');
  assert.equal(card.status.kind, 'state');
  assert.equal(model.unitSummary.compact, '2 units · 2 pending');
});

test('financial completion does not hide unfinished physical receiving work', () => {
  const model = pickupCardModel({
    key: 'pickup:41',
    rows: pickupOrderRecords([line({ order_status: 'COMPLETED', receiving_id: 9 })]),
  });
  const card = pickupRecordCard(model);
  assert.equal(model.state.id, 'DONE');
  assert.equal(card.state.id, 'PENDING');
});

test('physical units expand individually and the strongest actionable QC state wins', () => {
  const model = pickupCardModel({
    key: 'pickup:41',
    rows: pickupOrderRecords([line({
      order_status: 'COMPLETED',
      receiving_id: 9,
      receiving_line_id: 77,
      quantity: 3,
      unit_stage_facts: [
        {
          receiving_line_unit_id: 1001, receiving_line_id: 77, receiving_id: 9, ordinal: 1,
          serial_unit_id: 501, unit_uid: 'UNIT-1', serial: 'SN-1', condition_grade: 'USED_A',
          triage_state: 'TRIAGED', label_state: 'PRINTED', qc_state: 'PASSED', latest_verdict: 'PASS',
          tested_at: '2026-09-29T10:00:00.000Z', tested_by: 2, tested_by_name: 'Alex',
          primary_support_ticket_id: null, updated_at: '2026-09-29T10:00:01.000Z',
        },
        {
          receiving_line_unit_id: 1002, receiving_line_id: 77, receiving_id: 9, ordinal: 2,
          serial_unit_id: 502, unit_uid: 'UNIT-2', serial: null, condition_grade: 'USED_B',
          triage_state: 'TRIAGED', label_state: 'PRINTED', qc_state: 'FAILED', latest_verdict: 'TESTING_FAILED',
          tested_at: '2026-09-29T11:00:00.000Z', tested_by: 3, tested_by_name: 'Sam',
          primary_support_ticket_id: 9600, updated_at: '2026-09-29T11:00:01.000Z',
        },
      ],
    })]),
  });
  const card = pickupRecordCard(model);
  assert.equal(card.lines.length, 3, 'missing durable rows remain visible as virtual pending units');
  assert.equal(model.unitSummary.compact, '3 units · 1 passed · 1 failed · 1 pending');
  assert.equal(model.unitSummary.strongestQc, 'FAILED');
  assert.equal(model.unitSummary.tickets, 1);
  assert.equal(card.next?.label, 'Grade 1 unit', 'the earliest incomplete receiving stage wins the next action');
  assert.equal(card.chips.some((chip) => chip.id === 'tickets'), true);
});

test('pickup-date sorting orders whole orders and keeps undated records last', () => {
  const rows = [
    line({ id: 1, order_id: 1, po_number: 'LCPU-OLD', pickup_date: '2026-01-01' }),
    line({ id: 2, order_id: 2, po_number: 'LCPU-NEW', pickup_date: '2026-02-01' }),
    line({ id: 3, order_id: 3, po_number: 'LCPU-UNDATED', pickup_date: null }),
  ];
  assert.deepEqual(
    pickupBands(rows, 'newest').flatMap(([, groups]) => groups.map((group) => group.rows[0]!.orderId)),
    [2, 1, 3],
  );
  assert.deepEqual(
    pickupBands(rows, 'oldest').flatMap(([, groups]) => groups.map((group) => group.rows[0]!.orderId)),
    [1, 2, 3],
  );
});

test('the live pickup workspace cannot regress to the retired slot DataTable', () => {
  const source = readFileSync(join(process.cwd(), 'src/components/receiving/pickup/PickupWorkspace.tsx'), 'utf8');
  const registry = readFileSync(join(process.cwd(), 'src/components/tables/registered-bindings.ts'), 'utf8');
  assert.match(source, /TriageCardList/);
  assert.doesNotMatch(source, /PICKUP_TABLE_BINDING|usePickupTableLayout|<DataTable/);
  assert.doesNotMatch(registry, /PICKUP_TABLE_BINDING/);
});
