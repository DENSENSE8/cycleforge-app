/** Per-SKU bins catalog guards, materialization and adapter behaviour — the family that replaced `/inventory/health/sku/[sku]`'s five… */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import { isDataTableChromeColumn } from '@/lib/tables/data-table-header-sort';
import {
  dataTableCompoundColumnsFor,
  dataTableCompoundSortFactFor,
} from '@/components/tables/compound/data-table-compound-columns';
import { SKU_BINS_COMPOUND_COLUMNS } from '@/components/inventory/sku-bins-grid/sku-bins-table-definition';
import { skuBinsCompoundView } from '@/components/inventory/sku-bins-grid/sku-bins-row-view';
import type { SkuBinTableRow } from '@/lib/inventory/sku-bin-row';
import { SKU_BINS_FAMILY, SKU_BINS_FIELD_CATALOG, SKU_BINS_PRODUCT_LAYOUT } from './sku-bins';
import { resolveSkuBinsSlotValue, skuBinLevel } from './sku-bins-resolve';
import { BINS_FIELD_CATALOG } from './bins';


/**
 * Facts of the warehouse-wide `bins` row. They describe a LOCATION over every
 * SKU in it; this feed does not read them and no cell here paints them.
 */
const OVERVIEW_ONLY_COLUMNS = [
  'sku_count',
  'total_qty',
  'fill_pct',
  'capacity',
  'is_empty',
  'is_stale',
  'has_low_stock',
  'is_over_capacity',
] as const;

function row(overrides: Partial<SkuBinTableRow> = {}): SkuBinTableRow {
  return {
    location_id: 4120,
    bin_name: 'A · R2 · C4',
    bin_barcode: 'BIN-A-R2-C4',
    qty: 12,
    min_qty: 4,
    max_qty: 40,
    last_counted: '2026-09-10T23:04:12.000Z',
    sku: 'LAT5520-A',
    product_title: 'Dell Latitude 5520',
    ...overrides,
  };
}

describe('sku-bins catalog', () => {
  it('has unique ids, and every field is family-qualified and bindable', () => {
    const ids = SKU_BINS_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of SKU_BINS_FIELD_CATALOG) {
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.equal(field.family, 'sku-bins', `${field.id} is not a sku-bins fact`);
      assert.ok(field.id.startsWith('sku-bins.'), `${field.id} is not family-qualified`);
    }
  });

  it('names the five retired cells plus the two structural facts, and no others', () => {
    assert.deepEqual(
      SKU_BINS_FIELD_CATALOG.map((f) => f.id),
      [
        'sku-bins.bin',
        'sku-bins.item',
        'sku-bins.qty',
        'sku-bins.min_qty',
        'sku-bins.max_qty',
        'sku-bins.level',
        'sku-bins.last_counted',
      ],
    );
  });

  it('is NOT the warehouse `bins` overview — no shared objects, no aggregate facts', () => {
    // Reuse-by-reference is how a family borrows a sibling's fact
    // (`admin-returns` borrows five from the Ledger). This is the opposite
    // claim: these are different entities, so nothing is shared.
    const overviewObjects = new Set<unknown>(BINS_FIELD_CATALOG);
    const overviewIds = new Set(BINS_FIELD_CATALOG.map((f) => f.id));
    for (const field of SKU_BINS_FIELD_CATALOG) {
      assert.ok(!overviewObjects.has(field), `${field.id} is a bins-overview field object`);
      assert.ok(!overviewIds.has(field.id), `${field.id} collides with a bins-overview fact`);
      const paths = Object.values(field.paths ?? {});
      for (const aggregate of OVERVIEW_ONLY_COLUMNS) {
        assert.ok(
          !paths.includes(aggregate),
          `${field.id} reads '${aggregate}' — a LOCATION aggregate this feed never selects`,
        );
      }
    }
    // And the resolver has nothing to say about them either.
    for (const aggregate of OVERVIEW_ONLY_COLUMNS) {
      assert.equal(resolveSkuBinsSlotValue(row(), `sku-bins.${aggregate}`), null);
    }
  });

  it('product default parses, and the BIN is the identity', () => {
    const parsed = SKU_BINS_PRODUCT_LAYOUT;
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'sku-bins.bin');
    // The three quantity facts are the tracks…
    assert.deepEqual(
      parsed.statusBindings.map((b) => b.fieldId),
      ['sku-bins.qty', 'sku-bins.min_qty', 'sku-bins.max_qty'],
    );
    // …and nothing rides under the title: the note line is the SKU, which the
    // adapter supplies as a fallback rather than as a binding.
    assert.deepEqual(parsed.subtitleBindings, []);
    assert.equal(parsed.amountFieldId ?? null, null);
  });

  it('leaves the chrome-painted facts UNBOUND but still bindable', () => {
    const bound = new Set([
      SKU_BINS_PRODUCT_LAYOUT.identityFieldId,
      ...SKU_BINS_PRODUCT_LAYOUT.statusBindings.map((b) => b.fieldId),
      ...SKU_BINS_PRODUCT_LAYOUT.subtitleBindings.map((b) => b.fieldId),
    ]);
    const unbound = SKU_BINS_FIELD_CATALOG.filter((f) => !bound.has(f.id)).map((f) => f.id);
    // Title, state pill and Dates chrome paint these three — a bound track
    // beside each would print the same fact twice.
    assert.deepEqual(unbound, ['sku-bins.item', 'sku-bins.level', 'sku-bins.last_counted']);
    for (const id of unbound) {
      const field = SKU_BINS_FIELD_CATALOG.find((f) => f.id === id);
      assert.ok(field?.slotKinds.includes('status'), `${id} cannot be opted into a track`);
    }
  });
});

describe('sku-bins materialization', () => {
  it('mounts the SHARED compound skeleton WHOLE, in its order', () => {
    const chrome = SKU_BINS_COMPOUND_COLUMNS.map((c) => String(c.key)).filter(
      (k) => !k.startsWith('status:') && !k.startsWith('subtitle:'),
    );
    // No geometry cut: COMPOUND_SKELETON_FILTER_DEBT is shrink-only, so a
    // mount may relabel chrome but never drop it.
    assert.deepEqual(chrome, [...COMPOUND_COLUMN_KEYS]);
    // Compound paints subtitles INSIDE the item cell — never as tracks.
    assert.equal(
      SKU_BINS_COMPOUND_COLUMNS.filter((c) => String(c.key).startsWith('subtitle:')).length,
      0,
    );
    assert.equal(
      SKU_BINS_COMPOUND_COLUMNS.filter((c) => String(c.key).startsWith('status:')).length,
      SKU_BINS_PRODUCT_LAYOUT.statusBindings.length,
    );
  });

  it('relabels the chrome it paints facts into', () => {
    const label = (key: string) => SKU_BINS_COMPOUND_COLUMNS.find((c) => c.key === key)?.label;
    assert.equal(label('item'), 'Item');
    assert.equal(label('dates'), 'Counted');
    assert.equal(label('state'), 'Level');
    const identity = SKU_BINS_COMPOUND_COLUMNS.find((c) => c.key === 'fulfillment');
    assert.equal(identity?.fieldId, 'sku-bins.bin');
    // The identity header is the ENGINE's `Id` on every peer since 2026-09-15
    // (`data-table-family.ts`). "Bin" is now the Fields-picker row
    // and the cell's hover word, not the column header.
    assert.equal(identity?.label, 'Id');
    assert.equal(identity?.type, 'id');
  });

  it('rebinds without changing track keys (keys are slot indices)', () => {
    const columns = dataTableCompoundColumnsFor(SKU_BINS_FAMILY, {
      ...SKU_BINS_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'sku-bins.last_counted' }],
    });
    const slots = columns.filter((c) => String(c.key).startsWith('status:'));
    assert.deepEqual(
      slots.map((c) => c.key),
      ['status:1'],
    );
    assert.equal(slots[0]?.fieldId, 'sku-bins.last_counted');
  });

  it('every painted DATA header sorts; chrome stays dead', () => {
    for (const col of SKU_BINS_COMPOUND_COLUMNS) {
      if (isDataTableChromeColumn(col.key)) {
        assert.equal(dataTableCompoundSortFactFor(SKU_BINS_FAMILY, col), null, `${col.key} is chrome`);
        continue;
      }
      assert.ok(
        dataTableCompoundSortFactFor(SKU_BINS_FAMILY, col) !== null,
        `${col.key} is a painted data track with a dead header`,
      );
    }
    assert.equal(dataTableCompoundSortFactFor(SKU_BINS_FAMILY, { key: 'dates' }), 'sku-bins.last_counted');
    assert.equal(dataTableCompoundSortFactFor(SKU_BINS_FAMILY, { key: 'item' }), 'sku-bins.item');
    assert.equal(dataTableCompoundSortFactFor(SKU_BINS_FAMILY, { key: 'state' }), 'sku-bins.level');
    assert.equal(dataTableCompoundSortFactFor(SKU_BINS_FAMILY, { key: 'fulfillment' }), 'sku-bins.bin');
  });
});

describe('sku-bins resolver', () => {
  it('answers every catalog id off a realistic row', () => {
    for (const field of SKU_BINS_FIELD_CATALOG) {
      assert.notEqual(
        resolveSkuBinsSlotValue(row(), field.id),
        null,
        `${field.id} is in the catalog and the resolver cannot read it`,
      );
    }
  });

  it('names the bin by the handle it HAS', () => {
    assert.deepEqual(resolveSkuBinsSlotValue(row(), 'sku-bins.bin'), {
      kind: 'value',
      text: 'A · R2 · C4',
    });
    assert.deepEqual(resolveSkuBinsSlotValue(row({ bin_name: null }), 'sku-bins.bin'), {
      kind: 'value',
      text: 'BIN-A-R2-C4',
    });
    assert.deepEqual(
      resolveSkuBinsSlotValue(row({ bin_name: null, bin_barcode: '  ' }), 'sku-bins.bin'),
      { kind: 'value', text: '#4120' },
    );
  });

  it('dashes an unset bound instead of printing a zero', () => {
    // `min_qty IS NULL` means "no floor configured", which is not a floor of 0.
    assert.deepEqual(resolveSkuBinsSlotValue(row({ min_qty: null }), 'sku-bins.min_qty'), {
      kind: 'value',
      text: null,
    });
    // …and a real zero still prints.
    assert.deepEqual(resolveSkuBinsSlotValue(row({ qty: 0 }), 'sku-bins.qty'), {
      kind: 'value',
      text: '0',
    });
  });

  it('resolves `last_counted` to the absolute instant, not a face', () => {
    assert.deepEqual(resolveSkuBinsSlotValue(row(), 'sku-bins.last_counted'), {
      kind: 'value',
      text: '2026-09-10T23:04:12.000Z',
    });
    assert.deepEqual(resolveSkuBinsSlotValue(row({ last_counted: null }), 'sku-bins.last_counted'), {
      kind: 'value',
      text: null,
    });
  });

  it('reads the LEVEL off this pair\'s own bounds, in the overview\'s words', () => {
    assert.equal(skuBinLevel(row({ qty: 0 })), 'Empty');
    assert.equal(skuBinLevel(row({ qty: 3, min_qty: 4 })), 'Low');
    assert.equal(skuBinLevel(row({ qty: 41, max_qty: 40 })), 'Over');
    assert.equal(skuBinLevel(row()), 'Stocked');
    // No bounds configured is NOT a breach — and it is not "in range" either.
    assert.equal(skuBinLevel(row({ min_qty: null, max_qty: null })), 'Stocked');
    // The bound track and the pill read the same function, so they agree.
    assert.deepEqual(resolveSkuBinsSlotValue(row({ qty: 3 }), 'sku-bins.level'), {
      kind: 'value',
      text: 'Low',
    });
    assert.equal(skuBinsCompoundView(row({ qty: 3 })).stateLabel, 'Low');
  });

  it('knows nothing about a field id from another family', () => {
    assert.equal(resolveSkuBinsSlotValue(row(), 'bins.total_qty'), null);
    assert.equal(resolveSkuBinsSlotValue(row(), 'orders.picked'), null);
  });
});

describe('sku-bins row view', () => {
  it('paints the product as the title and the bin as the handle', () => {
    const view = skuBinsCompoundView(row());
    assert.equal(view.id, '4120');
    assert.equal(view.title, 'Dell Latitude 5520');
    assert.equal(view.note, 'LAT5520-A');
    // The bin is a LOCAL handle, so it rides `identityFace` — not `orderId`, which would inherit the marketplace dot and the open-on-platform menu
    // (operator 2026-09-14). This line pinned `orderId` from before that
    assert.deepEqual(view.identityFace, { value: 'A · R2 · C4', label: 'Bin' });
    assert.equal(view.orderId, null);
    assert.equal(view.stateLabel, 'Stocked');
    assert.equal(view.stateTone, 'neutral');
    // No carrier, no marketplace, no money, no photo on a bin row.
    assert.equal(view.tracking, null);
    assert.equal(view.platformValue, null);
    assert.equal(view.amount, null);
    assert.equal(view.thumbUrl, null);
  });

  it('never repeats the SKU on both title lines', () => {
    // No catalog row for this SKU: the title IS the SKU, so the note is empty
    // rather than printing it twice.
    const view = skuBinsCompoundView(row({ product_title: null }));
    assert.equal(view.title, 'LAT5520-A');
    assert.equal(view.note, null);
  });

  it('keeps the time the retired timestamp cell printed', () => {
    const view = skuBinsCompoundView(row());
    // Both DATES lines are used: the civil day on the Hash line, the clock on
    // the Calendar line — never the day alone with the time hidden in a tip.
    assert.ok(view.orderedAt?.label && !view.orderedAt.label.includes(':'));
    assert.equal(view.orderedAt?.dateKey?.length, 10);
    assert.ok(/\d:\d{2}\s?[AP]M$/i.test(view.delay?.faceLabel ?? ''));
    assert.equal(view.delay?.overdue, false);
    assert.equal(view.startedHover, view.delayTip);
    assert.ok(view.startedHover?.startsWith('Counted '));
  });

  it('leaves the DATES cell empty for a pair that was never counted', () => {
    const view = skuBinsCompoundView(row({ last_counted: null }));
    assert.equal(view.orderedAt, null);
    assert.equal(view.delay, null);
    assert.equal(view.startedHover, undefined);
  });

  it('raises the alert tone only for a breach', () => {
    assert.equal(skuBinsCompoundView(row({ qty: 3 })).stateTone, 'alert');
    assert.equal(skuBinsCompoundView(row({ qty: 99 })).stateTone, 'alert');
    // An empty bin is a bin this SKU has left, not an exception.
    assert.equal(skuBinsCompoundView(row({ qty: 0 })).stateTone, 'neutral');
  });
});
