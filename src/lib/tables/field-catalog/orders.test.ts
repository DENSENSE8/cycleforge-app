/** Orders catalog guards + resolver behaviour. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ShippedOrder } from '@/types/orders';
import {
  ORDERS_FIELD_CATALOG,
  ORDERS_INDEX_FIELD_CATALOG,
  ORDERS_INDEX_LAYOUT,
  ORDERS_PRODUCT_LAYOUT,
  omitShippedOnlyBindings,
} from './orders';
import {
  ordersIndexValues,
  ordersSlotValues,
  ordersSubtitleParts,
  resolveOrdersIndexValue,
  resolveOrdersSlotValue,
} from './orders-resolve';
import { resolveEffectiveLayout } from '../resolve-effective-layout';
import { ordersIndexColumnsFor } from '@/lib/dashboard-order-row-layout';
import { parseSlotLayout } from '../slot-layout';

function row(overrides: Record<string, unknown> = {}): ShippedOrder {
  return {
    id: 42,
    order_id: '12-34567-89012',
    product_title: 'Bose Wave Radio',
    condition: 'Used',
    serial_number: '',
    tested_by: null,
    test_date_time: null,
    packer_id: null,
    packed_by: null,
    packed_at: null,
    sku: 'BOSE-1',
    packer_photos_url: null,
    tracking_type: null,
    account_source: null,
    notes: '',
    status_history: null,
    created_at: null,
    ...overrides,
  } as unknown as ShippedOrder;
}

describe('orders catalog', () => {
  it('has unique ids, all orders-family, each bindable somewhere', () => {
    const ids = ORDERS_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of ORDERS_FIELD_CATALOG) {
      assert.equal(field.family, 'orders', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
    }
  });

  it('product default parses against the catalog (Pick + Pack status stamps, qty · amount · condition · item # · notes under the title)', () => {
    const parsed = parseSlotLayout(ORDERS_PRODUCT_LAYOUT, ORDERS_FIELD_CATALOG);
    assert.equal(parsed.morph, 'compound');
    assert.deepEqual(parsed.statusBindings, [
      { fieldId: 'orders.picked' },
      { fieldId: 'orders.packed' },
    ]);
    assert.deepEqual(parsed.subtitleBindings, [
      { fieldId: 'orders.qty' },
      { fieldId: 'orders.amount' },
      { fieldId: 'orders.condition' },
      { fieldId: 'orders.item_number' },
      { fieldId: 'orders.notes' },
    ]);
    assert.equal(parsed.identityFieldId, 'orders.order_id');
    assert.equal(parsed.amountFieldId, null);
  });

  it('omitShippedOnlyBindings drops scanned_out and leaves other status slots', () => {
    const withScanOut = {
      ...ORDERS_PRODUCT_LAYOUT,
      statusBindings: [
        { fieldId: 'orders.picked' },
        { fieldId: 'orders.packed' },
        { fieldId: 'orders.scanned_out' },
      ],
    };
    const stripped = omitShippedOnlyBindings(withScanOut);
    assert.deepEqual(stripped.statusBindings, [
      { fieldId: 'orders.picked' },
      { fieldId: 'orders.packed' },
    ]);
    assert.equal(omitShippedOnlyBindings(ORDERS_PRODUCT_LAYOUT), ORDERS_PRODUCT_LAYOUT);
  });

  it('every stage_event field carries an iconKey and one-word verb faces', () => {
    for (const field of ORDERS_FIELD_CATALOG) {
      if (field.displayType !== 'stage_event') continue;
      assert.ok(field.iconKey, `${field.id} has no iconKey`);
      // The done face paints the cell's top line; the pending face is the
      // blank-state dash's accessible name (operator ruling 2026-08-30).
      // Both stay one word so neither can grow into a sentence.
      assert.ok(field.stageLabels?.done, `${field.id} has no done face`);
      assert.ok(field.stageLabels?.pending, `${field.id} has no pending face`);
      assert.doesNotMatch(field.stageLabels!.done, /\s/, `${field.id} done face is not one word`);
      assert.doesNotMatch(field.stageLabels!.pending, /\s/, `${field.id} pending face is not one word`);
    }
  });

  it('does NOT offer a title subtitle — the item cell already leads with it', () => {
    assert.equal(ORDERS_FIELD_CATALOG.find((f) => f.id === 'orders.title'), undefined);
  });

  it('Pack column header is Pack — cell done-face stays Packed', () => {
    const packed = ORDERS_FIELD_CATALOG.find((f) => f.id === 'orders.packed');
    assert.equal(packed?.label, 'Pack');
    assert.equal(packed?.stageLabels?.done, 'Packed');
    assert.equal(packed?.stageLabels?.pending, 'Pack');
  });
});

describe('resolveOrdersSlotValue — stage events', () => {
  it('picked: the allocation-level pick scan resolves that picker and stamp', () => {
    const value = resolveOrdersSlotValue(
      row({ picked_by: 9, picked_by_name: 'Tuan', picked_at: '2026-07-13 16:15:00' }),
      'orders.picked',
      // The tester face the queue row still passes must not reach this cell.
      { testerDisplay: 'Marco' },
    );
    if (value?.kind !== 'stage_event') return assert.fail('expected stage_event');
    assert.equal(value.who, 'Tuan');
    assert.equal(value.whoStaffId, 9);
    assert.equal(value.at, 'Jul 13, 4:15 PM');
    assert.equal(value.station, null);
  });

  it('picked: a session-only row falls back to the session picker (feed COALESCEs both into one projection)', () => {
    const value = resolveOrdersSlotValue(
      row({ picked_by: 4, picked_by_name: 'Lena', picked_at: '2026-07-14 09:30:00' }),
      'orders.picked',
    );
    if (value?.kind !== 'stage_event') return assert.fail('expected stage_event');
    assert.equal(value.who, 'Lena');
    assert.equal(value.whoStaffId, 4);
    assert.match(String(value.at), /^Jul 14/);
  });

  it('picked: neither allocation nor session — the cell resolves empty', () => {
    assert.deepEqual(resolveOrdersSlotValue(row(), 'orders.picked'), {
      kind: 'stage_event',
      who: null,
      whoStaffId: null,
      at: null,
      station: null,
    });
  });

  it('picked: QC facts and an assigned picker are not a pick — the cell resolves EMPTY', () => {
    // QC is the unit's bench verdict and `picker_*` is the PICK assignment;
    // only `picked_*` (allocation, session, or PICK_SCANNED scan) marks it picked.
    const qcdAndAssigned = row({
      tested_by: 7,
      tested_by_name: 'Marco',
      test_activity_at: '2026-07-13 16:15:00',
      qc_verdict: 'PASS',
      picker_id: 5,
      picker_name: 'Lena',
    });
    assert.deepEqual(resolveOrdersSlotValue(qcdAndAssigned, 'orders.picked', { testerDisplay: 'Marco' }), {
      kind: 'stage_event',
      who: null,
      whoStaffId: null,
      at: null,
      station: null,
    });
  });

  it('picked: the `---` nobody-face and the `1` sentinel stamp resolve to null', () => {
    const value = resolveOrdersSlotValue(
      row({ picked_by_name: '---', picked_at: '1' }),
      'orders.picked',
    );
    if (value?.kind !== 'stage_event') return assert.fail('expected stage_event');
    assert.equal(value.who, null);
    assert.equal(value.at, null);
  });

  it('packed: bench short label rides the station line', () => {
    const value = resolveOrdersSlotValue(
      row({
        packed_by_name: 'Ana',
        packed_at: '2026-07-14T01:00:00Z',
        pack_location_name: 'QA Bench 2',
        pack_location_kind: 'PACK_BENCH',
      }),
      'orders.packed',
    );
    if (value?.kind !== 'stage_event') return assert.fail('expected stage_event');
    assert.equal(value.who, 'Ana');
    assert.equal(value.at, 'Jul 13, 6:00 PM');
    assert.equal(value.station, 'Bench 2');
  });

  it('scanned_out: dashes honestly on a feed that does not stamp it yet', () => {
    const value = resolveOrdersSlotValue(row(), 'orders.scanned_out');
    assert.deepEqual(value, {
      kind: 'stage_event',
      who: null,
      whoStaffId: null,
      at: null,
      station: null,
    });
  });

  it('actor STAFF ID rides each step', () => {
    const picked = resolveOrdersSlotValue(row({ picked_by: 7 }), 'orders.picked');
    if (picked?.kind !== 'stage_event') return assert.fail('expected stage_event');
    assert.equal(picked.whoStaffId, 7);

    const packed = resolveOrdersSlotValue(row({ packed_by: 12 }), 'orders.packed');
    if (packed?.kind !== 'stage_event') return assert.fail('expected stage_event');
    assert.equal(packed.whoStaffId, 12);
  });
});

describe('resolveOrdersSlotValue — value fields', () => {
  it('qty / notes / item # read their aliases; blanks resolve null', () => {
    const r = row({ quantity: '3', notes: ' fragile ', item_number: 'IT-100' });
    assert.deepEqual(resolveOrdersSlotValue(r, 'orders.qty'), { kind: 'value', text: '3' });
    assert.deepEqual(resolveOrdersSlotValue(r, 'orders.notes'), { kind: 'value', text: 'fragile' });
    assert.deepEqual(resolveOrdersSlotValue(r, 'orders.item_number'), { kind: 'value', text: 'IT-100' });
    assert.deepEqual(resolveOrdersSlotValue(row(), 'orders.notes'), { kind: 'value', text: null });
  });

  it('condition resolves the grade table label and refuses the empty dash', () => {
    const value = resolveOrdersSlotValue(row({ condition: 'USED_A' }), 'orders.condition');
    assert.equal(value?.kind, 'value');
    if (value?.kind !== 'value') return;
    assert.ok(value.text && value.text !== '--');
    assert.deepEqual(resolveOrdersSlotValue(row({ condition: '' }), 'orders.condition'), {
      kind: 'value',
      text: null,
    });
  });

  it('amount formats currency and refuses non-numeric wire values', () => {
    assert.deepEqual(resolveOrdersSlotValue(row({ sale_amount: '120.5' }), 'orders.amount'), {
      kind: 'value',
      text: '$120.50',
    });
    assert.deepEqual(resolveOrdersSlotValue(row({ sale_amount: 'abc' }), 'orders.amount'), {
      kind: 'value',
      text: null,
    });
  });

  it('unknown field id resolves null, never throws', () => {
    assert.equal(resolveOrdersSlotValue(row(), 'orders.ghost'), null);
  });
});

describe('ordersSlotValues', () => {
  it('keys resolved values by TRACK key for status slots only', () => {
    const slots = ordersSlotValues(
      row({ tested_by_name: 'Marco' }),
      [
        { key: 'item' },
        { key: 'status:1', fieldId: 'orders.picked' },
        { key: 'status:2', fieldId: 'orders.packed' },
        { key: 'subtitle:1', fieldId: 'orders.qty' },
      ],
    );
    assert.deepEqual(Object.keys(slots ?? {}), ['status:1', 'status:2']);
    assert.equal(slots?.['status:1']?.kind, 'stage_event');
  });

  it('returns undefined when no slot tracks are mounted', () => {
    assert.equal(ordersSlotValues(row(), [{ key: 'item' }, { key: 'state' }]), undefined);
  });
});

describe('ordersSubtitleParts', () => {
  it('paints qty as the BARE number, dark and bold (2+ still warns)', () => {
    // `widthCh: 2` reserves the two-digit case so a 10–99 quantity does not
    // shift every fact after it (operator ruling 2026-08-31).
    const single = ordersSubtitleParts(row({ quantity: '1' }), ['orders.qty']);
    assert.deepEqual(single, [
      { text: '1', toneClass: 'font-semibold text-text-default', key: 'orders.qty', widthCh: 2 },
    ]);
    const multi = ordersSubtitleParts(row({ quantity: '3' }), ['orders.qty']);
    assert.deepEqual(multi, [
      { text: '3', toneClass: 'font-semibold text-text-warning', key: 'orders.qty', widthCh: 2 },
    ]);
  });

  it('emits an empty item_number part so the listing glyph owns the face, even when the number is missing', () => {
    assert.deepEqual(ordersSubtitleParts(row({ item_number: '123456789012' }), [
      'orders.item_number',
    ]), [{ text: '', key: 'orders.item_number' }]);
    assert.deepEqual(ordersSubtitleParts(row({ item_number: '' }), ['orders.item_number']), [
      { text: '', key: 'orders.item_number' },
    ]);
  });

  it('paints condition in its grade tone and keeps notes quiet', () => {
    const parts = ordersSubtitleParts(
      row({ condition: 'USED_A', notes: 'leave at dock' }),
      ['orders.condition', 'orders.notes'],
    );
    assert.equal(parts.length, 2);
    assert.ok(parts[0].toneClass?.includes('font-semibold'), 'condition is bold under the title');
    assert.ok(!parts[1].toneClass?.includes('font-semibold'), 'notes stay the muted caption');
    assert.deepEqual(parts[1], { text: 'leave at dock', key: 'orders.notes' });
  });

  it('keeps BINDING order — the org-configured display order', () => {
    const r = row({ quantity: '2', condition: 'USED_A', notes: 'n' });
    const order = ordersSubtitleParts(r, ['orders.qty', 'orders.condition', 'orders.notes']).map(
      (p) => p.text,
    );
    const reversed = ordersSubtitleParts(r, ['orders.notes', 'orders.condition', 'orders.qty']).map(
      (p) => p.text,
    );
    assert.equal(order[0], '2');
    assert.equal(reversed[0], 'n');
    assert.deepEqual([...order].reverse(), reversed);
  });

  it('drops empty parts and returns an empty list when nothing paints', () => {
    assert.deepEqual(ordersSubtitleParts(row(), ['orders.qty', 'orders.notes']), []);
  });

  it('keeps a faint -- placeholder for a blank EDITABLE field — the in-place editor needs a click target', () => {
    const parts = ordersSubtitleParts(row({ condition: '', quantity: '2' }), [
      'orders.qty',
      'orders.condition',
    ], { editableFieldIds: ['orders.condition'] });
    assert.equal(parts.length, 2);
    // Binding position holds: qty first, then the condition placeholder.
    assert.equal(parts[0].text, '2');
    assert.deepEqual(parts[1], {
      text: '--',
      toneClass: 'text-text-faint',
      key: 'orders.condition',
    });
  });
});

describe('orders INDEX face — one row per order', () => {
  const ctx = { todayKey: '2026-09-26' };

  it('the product default parses against the index catalog and survives the cascade untouched', () => {
    const parsed = parseSlotLayout(ORDERS_INDEX_LAYOUT, ORDERS_INDEX_FIELD_CATALOG);
    assert.equal(parsed.morph, 'sheet');
    // No line-qty / line-money pin may inject Qty or Amount columns into the order list.
    const effective = resolveEffectiveLayout({
      productDefault: ORDERS_INDEX_LAYOUT,
      catalog: ORDERS_INDEX_FIELD_CATALOG,
    });
    assert.deepEqual(effective.statusBindings, ORDERS_INDEX_LAYOUT.statusBindings);
    assert.deepEqual(effective.subtitleBindings, []);
  });

  it('Order is the first column after the select gutter; Bin · Pick · Pack are offered but unbound', () => {
    const columns = ordersIndexColumnsFor(ORDERS_INDEX_LAYOUT);
    assert.deepEqual(
      columns.map((c) => (c.key === 'select' || c.key === '_fill' ? c.key : c.label)),
      ['select', 'Order', 'Date', 'Customer', 'Channel', 'Total', 'Fulfillment', 'Fulfill by', 'Items', 'Delivery', 'Tags', '_fill'],
    );
    const bound = new Set(ORDERS_INDEX_LAYOUT.statusBindings.map((b) => b.fieldId));
    for (const id of ['orders.bin', 'orders.picked', 'orders.packed']) {
      assert.ok(ORDERS_INDEX_FIELD_CATALOG.some((f) => f.id === id), `${id} not offered`);
      assert.ok(!bound.has(id), `${id} bound by default`);
    }
  });

  it('Total and Items are ORDER sums; a line with no sale falls back to its price as an estimate', () => {
    const lines = [
      row({ id: 1, sale_amount: '19.50', quantity: '2' }),
      row({ id: 2, sale_amount: null, price_cents: 1050, price_is_estimate: true, quantity: null }),
    ];
    assert.deepEqual(resolveOrdersIndexValue(lines, 'orders.total', ctx), {
      kind: 'money',
      text: '$30.00',
      estimate: true,
    });
    const items = resolveOrdersIndexValue(lines, 'orders.items', ctx);
    if (items?.kind !== 'items') return assert.fail('expected items');
    assert.equal(items.face, '3 items');
    assert.deepEqual(items.lines, ['2 × Bose Wave Radio', '1 × Bose Wave Radio']);
    assert.deepEqual(resolveOrdersIndexValue([row({ sale_amount: null })], 'orders.total', ctx), {
      kind: 'money',
      text: null,
      estimate: false,
    });
  });

  it('Fulfill by is the EARLIEST deadline across the lines', () => {
    const value = resolveOrdersIndexValue(
      [row({ id: 1, deadline_at: '2026-09-30T20:00:00Z' }), row({ id: 2, ship_by_date: '2026-09-20T20:00:00Z' })],
      'orders.fulfill_by',
      ctx,
    );
    if (value?.kind !== 'deadline') return assert.fail('expected deadline');
    assert.equal(value.delay.dateKey, '2026-09-20');
  });

  it('Tags: urgent first, the row flag (never Hold — the badge says it), then sentence-case condition', () => {
    const value = resolveOrdersIndexValue(
      [
        row({ id: 1, is_urgent: true, condition: 'USED', row_flag: { flag: 'priority', by: null, at: null } }),
        row({ id: 2, condition: 'USED' }),
      ],
      'orders.tags',
      ctx,
    );
    if (value?.kind !== 'tags') return assert.fail('expected tags');
    assert.deepEqual(
      value.tags.map((t) => t.label),
      ['Urgent', 'Priority', 'Used'],
    );
    const held = resolveOrdersIndexValue([row({ row_flag: { flag: 'hold', by: null, at: null } })], 'orders.tags', ctx);
    if (held?.kind !== 'tags') return assert.fail('expected tags');
    assert.deepEqual(held.tags.map((t) => t.label), ['Used']);
  });

  it('a group resolves one fulfillment badge over all its lines', () => {
    const columns = ordersIndexColumnsFor(ORDERS_INDEX_LAYOUT);
    const values = ordersIndexValues(
      [row({ id: 1, packed_at: '2026-09-25T10:00:00Z' }), row({ id: 2 })],
      columns,
      ctx,
    );
    const track = columns.find((c) => c.fieldId === 'orders.fulfillment')!.key;
    const badge = values[track];
    if (badge?.kind !== 'fulfillment') return assert.fail('expected fulfillment');
    assert.equal(badge.badge.label, 'Partially packed 1/2');
  });
});
