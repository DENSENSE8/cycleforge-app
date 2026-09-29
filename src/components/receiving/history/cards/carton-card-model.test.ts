import assert from 'node:assert/strict';
import test from 'node:test';
import type { RowGroup } from '@/lib/group-rows';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { cartonBands, cartonCardIdentity, cartonCardModel, cartonRecordCard, groupCartons } from './carton-card-model';

const row = (fields: Partial<ReceivingLineRow>) => fields as ReceivingLineRow;
const carton = (rows: ReceivingLineRow[]): RowGroup<ReceivingLineRow> => groupCartons(rows)[0]!;
const day = new Date().toISOString();
const clean = (receiving_id: number) =>
  row({ id: receiving_id * 10, receiving_id, workflow_status: 'DONE', received_done_at: day, unboxed_at: day, last_activity_at: day, quantity_received: 1, quantity_expected: 1 });
const unfound = (receiving_id: number) =>
  row({ id: -receiving_id, receiving_id, unboxed_at: day, last_activity_at: day });

test('an unfound carton leads its band; the rest keep the host order', () => {
  const rows = [clean(1), clean(2), unfound(3), clean(4), unfound(5)];
  const bands = cartonBands(rows, 'unboxed', true);
  const order = bands.flatMap(([, groups]) => groups.map((g) => g.rows[0]!.receiving_id));
  assert.deepEqual(order, [3, 5, 1, 2, 4]);
});

test('an explicit column sort is the operator order — unfound does not jump it', () => {
  const rows = [clean(1), unfound(3), clean(2)];
  const [[, groups]] = cartonBands(rows, 'unboxed', false);
  assert.deepEqual(groups.map((g) => g.rows[0]!.receiving_id), [1, 3, 2]);
});

test('a carton wears its most urgent line: unfound over a claimed short line', () => {
  const claimedShort = row({ id: 11, receiving_id: 9, workflow_status: 'DONE', received_done_at: day, quantity_received: 0, quantity_expected: 2, claim_ticket: '#1', ticket_reasons: [{ code: 'SHORT', ticket: '#1' }] });
  const unfoundLine = row({ id: 12, receiving_id: 9, receiving_source: 'unmatched', workflow_status: 'DONE', received_done_at: day, quantity_received: 1, quantity_expected: 1 });
  const model = cartonCardModel(carton([claimedShort, unfoundLine]), 'unboxed');
  assert.equal(model.state.id, 'UNFOUND');
  assert.equal(model.lead.id, 12);
});

test('the id is bare: the PO / order number, else the carton number with no "#"', () => {
  assert.equal(cartonCardIdentity(row({ id: -53339, receiving_id: 53339 })), '53339');
  assert.equal(cartonCardIdentity(row({ id: 5, receiving_id: 7, zoho_purchaseorder_number: '15-15190-56779' })), '15-15190-56779');
  assert.equal(cartonCardIdentity(row({ id: 5, receiving_id: 7, source_order_id: '111-8911758-3549041' })), '111-8911758-3549041');
});

test('the compact carton model carries tracking separately from its order identity', () => {
  const model = cartonCardModel(
    carton([
      row({
        id: 51,
        receiving_id: 8,
        zoho_purchaseorder_number: '15-15190-56779',
        tracking_number: '1Z3Y496R0398693994',
      }),
    ]),
    'scanned',
  );
  assert.equal(model.identity, '15-15190-56779');
  assert.equal(model.tracking, '1Z3Y496R0398693994');
});

test('Docked paints expected quantity without inferring Short', () => {
  const model = cartonCardModel(
    carton([
      row({
        id: 61,
        receiving_id: 9,
        scanned_at: day,
        quantity_received: 0,
        quantity_expected: 3,
      }),
    ]),
    'scanned',
    'docked',
  );
  const card = cartonRecordCard(model);
  assert.equal(card.state.id, 'DOCKED');
  assert.deepEqual(card.lines[0]?.facts.qty, { kind: 'qty', value: 3 });
  assert.equal(card.next?.label, 'Unbox');
});

test('Docked preserves arrival order instead of prioritizing an uninspected shortage', () => {
  const first = row({ id: 71, receiving_id: 10, scanned_at: day, quantity_received: 1, quantity_expected: 1 });
  const looksShortButIsSealed = row({ id: 72, receiving_id: 10, scanned_at: day, quantity_received: 0, quantity_expected: 4 });
  const model = cartonCardModel(carton([first, looksShortButIsSealed]), 'scanned', 'docked');
  assert.equal(model.lead.id, first.id);
  assert.deepEqual(model.rows.map((line) => line.id), [first.id, looksShortButIsSealed.id]);
  assert.equal(model.state.id, 'DOCKED');
});

test('the corner reads when the carton was first unpacked and by whom, date and time (PT)', () => {
  const lines = [
    row({ id: 21, receiving_id: 4, workflow_status: 'DONE', unboxed_at: '2026-09-25T23:10:00Z', unboxed_by_name: 'Dana', received_done_at: '2026-09-27T18:00:00Z', quantity_received: 1, quantity_expected: 1 }),
    row({ id: 22, receiving_id: 4, workflow_status: 'DONE', unbox_opened_at: '2026-09-25T22:42:00Z', received_done_at: '2026-09-27T18:00:00Z', quantity_received: 1, quantity_expected: 1 }),
  ];
  const card = cartonRecordCard(cartonCardModel(carton(lines), 'received'));
  assert.equal(card.status.kind, 'date');
  assert.match(card.status.face, /^Sep 25, 3:42\s?PM · Dana$/i);
  assert.match(card.status.tip ?? '', /^Unboxed · .* by Dana$/);
});

test('a carton never unpacked keeps its activity stamp in the corner, with no name', () => {
  const line = row({ id: 31, receiving_id: 5, workflow_status: 'DONE', received_done_at: '2026-09-27T18:00:00Z', received_by_name: 'Lin', quantity_received: 1, quantity_expected: 1 });
  const card = cartonRecordCard(cartonCardModel(carton([line]), 'received'));
  assert.match(card.status.face, /^Sep 27, 11:00\s?AM$/i);
});
