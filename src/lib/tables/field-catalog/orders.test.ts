/**
 * Orders catalog guards + resolver behaviour.
 *
 * The catalog is persisted-id vocabulary, so the guards here are the ones that
 * fail as silent config bugs otherwise: duplicate ids, a product default that
 * does not parse against its own catalog, a field bindable nowhere. The
 * resolver tests pin the row-alias → paint contract for each field.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ShippedOrder } from '@/types/orders';
import { ORDERS_FIELD_CATALOG, ORDERS_PRODUCT_LAYOUT, omitShippedOnlyBindings, omitShortageCoverageBindings, ensureShortageCoverageBinding } from './orders';
import {
  ordersSlotValues,
  ordersSubtitleParts,
  resolveOrdersSlotValue,
} from './orders-resolve';
import { parseSlotLayout } from '../slot-layout';

function row(overrides: Record<string, unknown> = {}): ShippedOrder {
  return {
    id: 42,
    order_id: '12-34567-89012',
    product_title: 'Bose Wave Radio',
    condition: 'Used',
    serial_number: '',
    tester_id: null,
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

  it('product default parses against the catalog (picked in status:1, qty · amount · condition · item # · notes binding)', () => {
    const parsed = parseSlotLayout(ORDERS_PRODUCT_LAYOUT, ORDERS_FIELD_CATALOG);
    assert.equal(parsed.morph, 'compound');
    assert.deepEqual(parsed.statusBindings, [{ fieldId: 'orders.picked' }]);
    // Operator lock 2026-08-30, extended 2026-08-31 with the item number and
    // 2026-09-04 with the amount (which gave up its column for this seat, and
    // sits with the qty as the line-item pair): the line, IN THIS ORDER.
    assert.deepEqual(parsed.subtitleBindings, [
      { fieldId: 'orders.qty' },
      { fieldId: 'orders.amount' },
      { fieldId: 'orders.condition' },
      { fieldId: 'orders.item_number' },
      { fieldId: 'orders.notes' },
    ]);
    assert.equal(parsed.identityFieldId, 'orders.order_id');
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

  it('omitShortageCoverageBindings drops coverage; ensureShortageCoverageBinding appends it', () => {
    const withCoverage = {
      ...ORDERS_PRODUCT_LAYOUT,
      statusBindings: [
        { fieldId: 'orders.picked' },
        { fieldId: 'orders.coverage' },
      ],
    };
    assert.deepEqual(omitShortageCoverageBindings(withCoverage).statusBindings, [
      { fieldId: 'orders.picked' },
    ]);
    const ensured = ensureShortageCoverageBinding(ORDERS_PRODUCT_LAYOUT);
    assert.ok(ensured.statusBindings.some((b) => b.fieldId === 'orders.coverage'));
    assert.equal(omitShortageCoverageBindings(ORDERS_PRODUCT_LAYOUT), ORDERS_PRODUCT_LAYOUT);
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
});

describe('resolveOrdersSlotValue — stage events', () => {
  it('picked: ctx display name + formatted stamp; missing station dashes', () => {
    const value = resolveOrdersSlotValue(
      row({ test_activity_at: '2026-07-13 16:15:00' }),
      'orders.picked',
      { testerDisplay: 'Tuan' },
    );
    assert.equal(value?.kind, 'stage_event');
    assert.ok(value && 'who' in value);
    if (value?.kind !== 'stage_event') return;
    assert.equal(value.who, 'Tuan');
    assert.match(String(value.at), /^Jul 13/);
    assert.equal(value.station, null);
  });

  it('picked: the `---` nobody-face and the `1` sentinel stamp resolve to null', () => {
    const value = resolveOrdersSlotValue(row({ test_date_time: '1' }), 'orders.picked', {
      testerDisplay: '---',
    });
    if (value?.kind !== 'stage_event') return assert.fail('expected stage_event');
    assert.equal(value.who, null);
    assert.equal(value.at, null);
  });

  it('picked: falls back to the wire name when the view layer passes none', () => {
    const value = resolveOrdersSlotValue(row({ tested_by_name: 'Marco' }), 'orders.picked');
    if (value?.kind !== 'stage_event') return assert.fail('expected stage_event');
    assert.equal(value.who, 'Marco');
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

  it('actor STAFF ID rides each step — scan actor first, assignee fallback', () => {
    const tested = resolveOrdersSlotValue(
      row({ tested_by: 7, tester_id: 3 }),
      'orders.picked',
    );
    if (tested?.kind !== 'stage_event') return assert.fail('expected stage_event');
    assert.equal(tested.whoStaffId, 7);

    const assignedOnly = resolveOrdersSlotValue(row({ tester_id: 3 }), 'orders.picked');
    if (assignedOnly?.kind !== 'stage_event') return assert.fail('expected stage_event');
    // Assigned-but-untested: the mark shows WHO should act (pending verb).
    assert.equal(assignedOnly.whoStaffId, 3);

    const packed = resolveOrdersSlotValue(row({ packed_by: 12 }), 'orders.packed');
    if (packed?.kind !== 'stage_event') return assert.fail('expected stage_event');
    assert.equal(packed.whoStaffId, 12);

    const nobody = resolveOrdersSlotValue(row({ tested_by: 'x', tester_id: 0 }), 'orders.picked');
    if (nobody?.kind !== 'stage_event') return assert.fail('expected stage_event');
    assert.equal(nobody.whoStaffId, null);
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
    // Absent is not zero: `$0.00` on an unpriced row is a figure nobody charged.
    assert.deepEqual(resolveOrdersSlotValue(row({ sale_amount: null }), 'orders.amount'), {
      kind: 'value',
      text: null,
    });
  });

  it('unknown field id resolves null, never throws', () => {
    assert.equal(resolveOrdersSlotValue(row(), 'orders.ghost'), null);
  });

  it('coverage paints the SoT face from jsonb facts', () => {
    assert.deepEqual(
      resolveOrdersSlotValue(
        row({
          shortage_coverage: {
            po_number: '4501',
            inbound_tracking: '9261290983197850083534',
            eta: null,
          },
        }),
        'orders.coverage',
      ),
      { kind: 'value', text: 'Awaiting inbound · PO 4501' },
    );
    assert.deepEqual(resolveOrdersSlotValue(row(), 'orders.coverage'), {
      kind: 'value',
      text: 'Uncovered',
    });
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

  it('keeps the item_number value available to title hover actions, even when missing', () => {
    assert.deepEqual(ordersSubtitleParts(row({ item_number: '123456789012' }), [
      'orders.item_number',
    ]), [{ text: '123456789012', key: 'orders.item_number' }]);
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
      // The placeholder keeps the painted face's reservation — an empty
      // condition that shrank to two characters would slide every fact after
      // it left on exactly the rows that have least to say.
      widthCh: 5,
    });
  });

  it('paints the AMOUNT slot even when the row has no price and nothing can edit it', () => {
    const parts = ordersSubtitleParts(row({ sale_amount: null }), ['orders.amount']);
    // The currency mark stays: `$-` is an empty PRICE, `--` is an empty
    // anything (operator 2026-09-04).
    assert.deepEqual(parts, [
      { text: '$-', toneClass: 'font-semibold text-text-success', key: 'orders.amount', widthCh: 8 },
    ]);
  });

  it('paints a present amount as formatted money in its reserved box', () => {
    const parts = ordersSubtitleParts(row({ sale_amount: '49.99' }), ['orders.amount']);
    assert.equal(parts[0].text, '$49.99');
    assert.equal(parts[0].widthCh, 8);
    // Same weight as the qty it pairs with — not a footnote to it — and the
    // one hue this line spends on money.
    assert.equal(parts[0].toneClass, 'font-semibold text-text-success');
  });
});

describe('wave 6 — the seller facts', () => {
  const ids = ORDERS_FIELD_CATALOG.map((f) => f.id);

  it('names the facts the feed returns on BOTH readers', () => {
    for (const id of [
      'orders.sku',
      'orders.tracking',
      'orders.carrier',
      'orders.delivery_status',
      'orders.delivery_event',
      'orders.exception',
      'orders.platform',
      'orders.flag',
      'orders.note_count',
      'orders.urgent',
      'orders.stock',
      'orders.serial',
      'orders.age',
    ]) {
      assert.ok(ids.includes(id), `${id} is missing from the catalog`);
    }
  });

  it('REFUSES the one-reader facts — they would be lane-dependent, silently', () => {
    // `orders-queries.ts` never joins `sku_catalog` and carries no pack
    // location, tech-scan or customer handle, so binding any of these would
    // paint on the Pending queue and go blank on every shipped lane with no
    // error anywhere. The catalog docblock names the fix for each.
    for (const refused of [
      'orders.catalog_image_url',
      'orders.image',
      'orders.catalog_category',
      'orders.pack_location',
      'orders.tech_scan',
      'orders.customer',
      'orders.buyer',
      'orders.label_printed',
    ]) {
      assert.equal(ids.includes(refused), false, `${refused} must stay refused`);
    }
  });

  it('refuses a CURRENCY track — it is how Amount prints, not a column', () => {
    assert.equal(ids.includes('orders.currency'), false);
  });

  it('refuses a clock-derived lateness fact — the surface owns nowMs', () => {
    for (const id of ['orders.late', 'orders.lateness', 'orders.days_late', 'orders.age_days']) {
      assert.equal(ids.includes(id), false);
    }
  });

  it('invents NO display type — every field uses geometry that already exists', () => {
    const known = new Set([
      'id', 'text', 'number', 'tag', 'date', 'person', 'stage_event', 'money', 'note', 'tracking',
    ]);
    for (const field of ORDERS_FIELD_CATALOG) {
      assert.ok(known.has(field.displayType), `${field.id}: ${field.displayType}`);
    }
  });

  it('gives every new fact a real slot, never an empty slotKinds', () => {
    for (const field of ORDERS_FIELD_CATALOG) {
      assert.ok(field.slotKinds.length > 0, field.id);
    }
  });

  it('keeps ids unique', () => {
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe('wave 6 — the resolvers behind those facts', () => {
  const ROW = {
    order_id: '09-69683',
    sku: 'BOSE-WAVE-IV',
    tracking_number: '1Z999AA10123456784',
    carrier: 'UPS',
    latest_status_label: 'Out for delivery',
    latest_status_code: 'OFD',
    account_source: 'ebay_main',
    row_flag: { flag: 'damaged', by: 'Tuan', at: '2026-09-01' },
    note_count: 3,
    is_urgent: true,
    is_out_of_stock: false,
    serial_number: '9M52B2C4',
  } as unknown as Parameters<typeof resolveOrdersSlotValue>[0];

  const text = (fieldId: string, row = ROW) => {
    const value = resolveOrdersSlotValue(row, fieldId);
    return value?.kind === 'value' ? value.text : null;
  };

  it('reads the plain facts', () => {
    assert.equal(text('orders.sku'), 'BOSE-WAVE-IV');
    assert.equal(text('orders.carrier'), 'UPS');
    assert.equal(text('orders.platform'), 'ebay_main');
    assert.equal(text('orders.serial'), '9M52B2C4');
    assert.equal(text('orders.tracking'), '1Z999AA10123456784');
  });

  it('takes the carrier’s WORDS, falling back to its code', () => {
    assert.equal(text('orders.delivery_status'), 'Out for delivery');
    const noLabel = { ...ROW, latest_status_label: null } as typeof ROW;
    assert.equal(text('orders.delivery_status', noLabel), 'OFD');
  });

  it('pulls the flag out of the row_flag OBJECT, not the object itself', () => {
    assert.equal(text('orders.flag'), 'damaged');
  });

  it('prints a note count only when there is one — zero is absence, not a value', () => {
    assert.equal(text('orders.note_count'), '3');
    assert.equal(text('orders.note_count', { ...ROW, note_count: 0 } as typeof ROW), null);
  });

  it('paints Urgent one-sidedly — a column of "No" is a column of noise', () => {
    assert.equal(text('orders.urgent'), 'Urgent');
    assert.equal(text('orders.urgent', { ...ROW, is_urgent: false } as typeof ROW), null);
  });

  it('answers stock BOTH ways, because "In stock" is the thing being asked', () => {
    assert.equal(text('orders.stock'), 'In stock');
    assert.equal(text('orders.stock', { ...ROW, is_out_of_stock: true } as typeof ROW), 'Out');
  });

  it('reads an ABSENT boolean as a dash, never as a confident No', () => {
    // The row not carrying the flag and the flag being false are different
    // answers, and only one of them is ours to give.
    assert.equal(text('orders.stock', { ...ROW, is_out_of_stock: null } as typeof ROW), null);
    assert.equal(text('orders.exception', ROW), null);
    assert.equal(
      text('orders.exception', { ...ROW, has_exception: true } as typeof ROW),
      'Exception',
    );
  });

  it('resolves EVERY catalog field rather than falling through to null', () => {
    // The law this file exists for: a new bindable fact needs a resolver case,
    // never a new column file. A field with no case paints an empty track.
    const missing = ORDERS_FIELD_CATALOG.filter(
      (f) => resolveOrdersSlotValue(ROW, f.id) === null && !UNRESOLVED_ON_THIS_ROW.has(f.id),
    ).map((f) => f.id);
    assert.deepEqual(missing, [], 'these fields have no resolver arm');
  });
});

/** Fields whose fixture value is legitimately absent above (blank ⇒ null). */
const UNRESOLVED_ON_THIS_ROW = new Set([
  'orders.picked',
  'orders.packed',
  'orders.scanned_out',
  'orders.item_number',
  'orders.qty',
  'orders.condition',
  'orders.notes',
  'orders.coverage',
  'orders.amount',
  'orders.delivery_event',
  'orders.exception',
  'orders.age',
]);
