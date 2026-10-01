/** Stock-ledger catalog guards, materialization and adapter behaviour — the family that replaced `/inventory/health/sku/[sku]`'s six… */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import { isDataTableChromeColumn } from '@/lib/tables/data-table-header-sort';
import {
  SKU_LEDGER_COMPOUND_COLUMNS,
  skuLedgerCompoundColumnsFor,
  skuLedgerSortFactFor,
} from '@/components/inventory/sku-ledger-grid/sku-ledger-grid-layout';
import {
  skuLedgerClockFace,
  skuLedgerCompoundView,
} from '@/components/inventory/sku-ledger-grid/sku-ledger-row-view';
import type { SkuLedgerTableRow } from '@/lib/inventory/sku-ledger-row';
import { SKU_LEDGER_FIELD_CATALOG, SKU_LEDGER_PRODUCT_LAYOUT } from './sku-ledger';
import { resolveSkuLedgerSlotValue, skuLedgerDeltaText } from './sku-ledger-resolve';


/**
 * Columns of `sku_stock_ledger` that no cell has ever painted — refs and codes
 * this `SELECT` does not even read. None is a fact until something paints it.
 */
const UNPAINTED_COLUMNS = [
  'reason_code_id',
  'ref_packer_log_id',
  'ref_tech_log_id',
  'ref_sal_id',
  'ref_shipment_id',
] as const;

function row(overrides: Partial<SkuLedgerTableRow> = {}): SkuLedgerTableRow {
  return {
    id: 55120,
    created_at: '2026-09-10T23:04:12.000Z',
    delta: -3,
    reason: 'SALE',
    notes: null,
    dimension: 'WAREHOUSE',
    staff_id: 17,
    staff_name: 'David',
    ref_order_id: 48123,
    ref_receiving_line_id: 902,
    ref_serial_unit_id: 7741,
    ...overrides,
  };
}

describe('sku-ledger catalog', () => {
  it('has unique ids, and every field is family-qualified and bindable', () => {
    const ids = SKU_LEDGER_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of SKU_LEDGER_FIELD_CATALOG) {
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.equal(field.family, 'sku-ledger', `${field.id} is not a sku-ledger fact`);
      assert.ok(field.id.startsWith('sku-ledger.'), `${field.id} is not family-qualified`);
    }
  });

  it('names the EIGHT facts the six retired cells painted, plus the note', () => {
    assert.deepEqual(
      SKU_LEDGER_FIELD_CATALOG.map((f) => f.id),
      [
        'sku-ledger.ref_order',
        'sku-ledger.reason',
        'sku-ledger.notes',
        'sku-ledger.delta',
        'sku-ledger.dimension',
        'sku-ledger.staff',
        'sku-ledger.ref_serial_unit',
        'sku-ledger.ref_receiving_line',
        'sku-ledger.when',
      ],
    );
  });

  it('splits the Refs cell into three INDEPENDENT facts', () => {
    const refs = SKU_LEDGER_FIELD_CATALOG.filter((f) => f.id.includes('.ref_'));
    assert.deepEqual(
      refs.map((f) => [f.id, f.label, f.displayType]),
      [
        ['sku-ledger.ref_order', 'Order', 'id'],
        ['sku-ledger.ref_serial_unit', 'Unit', 'id'],
        ['sku-ledger.ref_receiving_line', 'Receiving line', 'id'],
      ],
    );
    // Each reads ONE column — a fact that read two would be the joined cell
    // again with a catalog entry.
    for (const ref of refs) {
      assert.equal(Object.values(ref.paths ?? {}).length, 1, `${ref.id} reads more than one column`);
    }
    // …and each resolves the BARE number: `ord#12` existed to tell three
    // values apart inside one string, and it would break id collation.
    assert.deepEqual(resolveSkuLedgerSlotValue(row(), 'sku-ledger.ref_order'), {
      kind: 'value',
      text: '48123',
    });
    assert.deepEqual(resolveSkuLedgerSlotValue(row(), 'sku-ledger.ref_serial_unit'), {
      kind: 'value',
      text: '7741',
    });
    assert.deepEqual(resolveSkuLedgerSlotValue(row(), 'sku-ledger.ref_receiving_line'), {
      kind: 'value',
      text: '902',
    });
  });

  it('does NOT name any unpainted ref — no cell paints them', () => {
    for (const field of SKU_LEDGER_FIELD_CATALOG) {
      const paths = Object.values(field.paths ?? {});
      for (const unpainted of UNPAINTED_COLUMNS) {
        assert.ok(
          !paths.includes(unpainted),
          `${field.id} reads '${unpainted}', a column no cell paints`,
        );
      }
      assert.ok(
        !UNPAINTED_COLUMNS.some((c) => field.id.endsWith(`.${c}`)),
        `${field.id} names an unpainted column`,
      );
    }
    // And the resolver has nothing to say about them either.
    for (const unpainted of UNPAINTED_COLUMNS) {
      assert.equal(resolveSkuLedgerSlotValue(row(), `sku-ledger.${unpainted}`), null);
    }
  });

  it('product default parses, and the ORDER ref is the identity', () => {
    const parsed = SKU_LEDGER_PRODUCT_LAYOUT;
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'sku-ledger.ref_order');
    // What moved, who moved it, and which unit — the three tracks.
    assert.deepEqual(
      parsed.statusBindings.map((b) => b.fieldId),
      ['sku-ledger.delta', 'sku-ledger.staff', 'sku-ledger.ref_serial_unit'],
    );
    assert.deepEqual(parsed.subtitleBindings, []);
    // A signed QUANTITY is not money, and the compound skeleton has no amount
    // track to put it in.
    assert.equal(parsed.amountFieldId ?? null, null);
  });

  it('leaves the chrome-painted facts and the third ref UNBOUND but bindable', () => {
    const bound = new Set([
      SKU_LEDGER_PRODUCT_LAYOUT.identityFieldId,
      ...SKU_LEDGER_PRODUCT_LAYOUT.statusBindings.map((b) => b.fieldId),
      ...SKU_LEDGER_PRODUCT_LAYOUT.subtitleBindings.map((b) => b.fieldId),
    ]);
    const unbound = SKU_LEDGER_FIELD_CATALOG.filter((f) => !bound.has(f.id)).map((f) => f.id);
    assert.deepEqual(unbound, [
      // Title, note line, pill and Dates chrome paint these four…
      'sku-ledger.reason',
      'sku-ledger.notes',
      'sku-ledger.dimension',
      // …and the receiving-line ref rides the free fourth slot when an org
      // wants it (the whole skeleton leaves exactly four).
      'sku-ledger.ref_receiving_line',
      'sku-ledger.when',
    ]);
    for (const id of unbound) {
      const field = SKU_LEDGER_FIELD_CATALOG.find((f) => f.id === id);
      assert.ok(field?.slotKinds.includes('status'), `${id} cannot be opted into a track`);
    }
  });
});

describe('sku-ledger materialization', () => {
  it('mounts the SHARED compound skeleton WHOLE, in its order', () => {
    const chrome = SKU_LEDGER_COMPOUND_COLUMNS.map((c) => String(c.key)).filter(
      (k) => !k.startsWith('status:') && !k.startsWith('subtitle:'),
    );
    // No geometry cut: COMPOUND_SKELETON_FILTER_DEBT is shrink-only, so a
    // mount may relabel chrome but never drop it.
    assert.deepEqual(chrome, [...COMPOUND_COLUMN_KEYS]);
    // Compound paints subtitles INSIDE the item cell — never as tracks.
    assert.equal(
      SKU_LEDGER_COMPOUND_COLUMNS.filter((c) => String(c.key).startsWith('subtitle:')).length,
      0,
    );
    assert.equal(
      SKU_LEDGER_COMPOUND_COLUMNS.filter((c) => String(c.key).startsWith('status:')).length,
      SKU_LEDGER_PRODUCT_LAYOUT.statusBindings.length,
    );
  });

  it('relabels the chrome it paints facts into', () => {
    const label = (key: string) => SKU_LEDGER_COMPOUND_COLUMNS.find((c) => c.key === key)?.label;
    assert.equal(label('item'), 'Reason');
    assert.equal(label('dates'), 'When');
    assert.equal(label('state'), 'Dimension');
    const identity = SKU_LEDGER_COMPOUND_COLUMNS.find((c) => c.key === 'fulfillment');
    assert.equal(identity?.fieldId, 'sku-ledger.ref_order');
    // The identity header is the ENGINE's `Id` on every peer since 2026-09-15
    // (`data-table-family.ts`). "Order" is now the Fields-picker row
    // and the cell's hover word, not the column header.
    assert.equal(identity?.label, 'Id');
    assert.equal(identity?.type, 'id');
  });

  it('rebinds without changing track keys (keys are slot indices)', () => {
    const columns = skuLedgerCompoundColumnsFor({
      ...SKU_LEDGER_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'sku-ledger.ref_receiving_line' }],
    });
    const slots = columns.filter((c) => String(c.key).startsWith('status:'));
    assert.deepEqual(
      slots.map((c) => c.key),
      ['status:1'],
    );
    assert.equal(slots[0]?.fieldId, 'sku-ledger.ref_receiving_line');
  });

  it('every painted DATA header sorts; chrome stays dead', () => {
    for (const col of SKU_LEDGER_COMPOUND_COLUMNS) {
      if (isDataTableChromeColumn(col.key)) {
        assert.equal(skuLedgerSortFactFor(col), null, `${col.key} is chrome`);
        continue;
      }
      assert.ok(
        skuLedgerSortFactFor(col) !== null,
        `${col.key} is a painted data track with a dead header`,
      );
    }
    assert.equal(skuLedgerSortFactFor({ key: 'dates' }), 'sku-ledger.when');
    assert.equal(skuLedgerSortFactFor({ key: 'item' }), 'sku-ledger.reason');
    assert.equal(skuLedgerSortFactFor({ key: 'state' }), 'sku-ledger.dimension');
    assert.equal(skuLedgerSortFactFor({ key: 'fulfillment' }), 'sku-ledger.ref_order');
  });
});

describe('sku-ledger resolver', () => {
  it('answers every catalog id off a realistic row', () => {
    for (const field of SKU_LEDGER_FIELD_CATALOG) {
      assert.notEqual(
        resolveSkuLedgerSlotValue(row(), field.id),
        null,
        `${field.id} is in the catalog and the resolver cannot read it`,
      );
    }
  });

  it('keeps the SIGN of the movement in the text, and sorts as arithmetic', () => {
    assert.equal(skuLedgerDeltaText(12), '+12');
    assert.equal(skuLedgerDeltaText(-240), '-240');
    assert.equal(skuLedgerDeltaText(0), '0');
    assert.deepEqual(resolveSkuLedgerSlotValue(row({ delta: 12 }), 'sku-ledger.delta'), {
      kind: 'value',
      text: '+12',
    });
    // The `number` display type sends the text through the numeric comparator,
    // so the signed face must still parse as a number.
    assert.equal(Number(skuLedgerDeltaText(12)), 12);
    assert.equal(Number(skuLedgerDeltaText(-240)), -240);
  });

  it('resolves the staffer as a PERSON, never as the "system" sentinel', () => {
    assert.deepEqual(resolveSkuLedgerSlotValue(row(), 'sku-ledger.staff'), {
      kind: 'person',
      staffId: 17,
      name: 'David',
    });
    // A machine write has no staff id; the person face draws the absence rather
    // than naming a machine "system" as though it were a staffer.
    assert.deepEqual(
      resolveSkuLedgerSlotValue(row({ staff_id: null, staff_name: null }), 'sku-ledger.staff'),
      { kind: 'person', staffId: null, name: null },
    );
  });

  it('resolves `when` to the absolute instant, not a face', () => {
    assert.deepEqual(resolveSkuLedgerSlotValue(row(), 'sku-ledger.when'), {
      kind: 'value',
      text: '2026-09-10T23:04:12.000Z',
    });
  });

  it('dashes a ref the movement does not have', () => {
    assert.deepEqual(resolveSkuLedgerSlotValue(row({ ref_order_id: null }), 'sku-ledger.ref_order'), {
      kind: 'value',
      text: null,
    });
  });

  it('knows nothing about a field id from another family', () => {
    assert.equal(resolveSkuLedgerSlotValue(row(), 'inventory-events.occurred'), null);
    assert.equal(resolveSkuLedgerSlotValue(row(), 'orders.picked'), null);
  });
});

describe('sku-ledger row view', () => {
  it('paints the reason as the title and the order as the handle', () => {
    const view = skuLedgerCompoundView(row());
    assert.equal(view.id, '55120');
    assert.equal(view.title, 'SALE');
    assert.equal(view.orderId, '48123');
    assert.equal(view.stateLabel, 'WAREHOUSE');
    assert.equal(view.stateTone, 'neutral');
    // The fallback note line is the movement itself — the one fact a ledger
    // row cannot be read without.
    assert.equal(view.note, '-3');
    // No carrier, no marketplace, no money, no photo on a ledger row.
    assert.equal(view.tracking, null);
    assert.equal(view.platformValue, null);
    assert.equal(view.amount, null);
    assert.equal(view.thumbUrl, null);
  });

  it('keeps the seconds the retired timestamp cell printed', () => {
    const view = skuLedgerCompoundView(row());
    const clock = skuLedgerClockFace(row().created_at);
    assert.ok(clock && /:\d{2}:\d{2}\s?[AP]M$/i.test(clock), `clock face lost its seconds: ${clock}`);
    // Both DATES lines are used: the civil day on the Hash line, the clock on
    // the Calendar line. Never the day alone with the time hidden in a tip.
    assert.equal(view.delay?.faceLabel, clock);
    assert.equal(view.delay?.overdue, false);
    assert.ok(view.orderedAt?.label && !view.orderedAt.label.includes(':'));
    assert.equal(view.orderedAt?.dateKey?.length, 10);
    assert.equal(view.startedHover, `${view.orderedAt?.label} · ${clock}`);
  });

  it('never invents a reason, a bucket or a stamp for a malformed row', () => {
    const view = skuLedgerCompoundView(row({ reason: '', dimension: '  ', created_at: '' }));
    assert.equal(view.title, 'Ledger #55120');
    assert.equal(view.stateLabel, 'Unknown bucket');
    assert.equal(view.orderedAt, null);
    assert.equal(view.delay, null);
  });

  it('paints a phone take in words, with the operator note under it', () => {
    const fba = skuLedgerCompoundView(row({ reason: 'TAKE_FBA', delta: -2 }));
    assert.equal(fba.title, 'Taken · FBA');
    // No note written ⇒ the note line keeps the movement.
    assert.equal(fba.note, '-2');
    assert.deepEqual(resolveSkuLedgerSlotValue(row({ reason: 'TAKE_FBA' }), 'sku-ledger.reason'), {
      kind: 'value',
      text: 'Taken · FBA',
    });

    const custom = row({ reason: 'TAKE_CUSTOM', notes: 'Returned to vendor' });
    const view = skuLedgerCompoundView(custom);
    assert.equal(view.title, 'Taken');
    assert.equal(view.note, 'Returned to vendor');
    assert.deepEqual(resolveSkuLedgerSlotValue(custom, 'sku-ledger.notes'), {
      kind: 'value',
      text: 'Returned to vendor',
    });
  });
});
