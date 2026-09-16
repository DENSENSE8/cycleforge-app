/**
 * Stock-by-location catalog guards, materialization and room-facet behaviour —
 * the family behind Inventory › Stock.
 *
 * Four assertions here are load-bearing beyond the usual shape checks:
 *
 * - the NON-FORK. `bins` is a LOCATION with aggregates over every SKU inside
 *   it, and `sku-bins` is one SKU's pairs on a page that already names the SKU.
 *   A future agent reading "bins already exist" will be tempted to reuse one of
 *   those catalogs or copy its aggregate facts; this file fails the day one of
 *   those names appears here.
 * - the LINE-QTY LOCK. The operator asked for the count UNDER the product
 *   title. That is not a layout preference — `ensureLineQtySubtitle` pins
 *   `{family}.qty` to `subtitle:1` on every peer, so the catalog must name the
 *   fact in the shape that law recognises or the count silently becomes a
 *   column.
 * - the LEVEL SoT. The state pill and the bound `level` track must say the same
 *   word, so both read `locationStockLevel`, and `Empty` must stay unmintable:
 *   the feed excludes `qty = 0`, so a fourth word would be a dead sort bucket.
 * - the ROOM FACET. The funnel's options and the body's filter must agree, and
 *   a cleared funnel must mean the whole warehouse rather than nothing.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';
import { ensureLineQtySubtitle, isLineQtyField } from '@/lib/tables/slot-table-line-qty';
import {
  slotTableColumnsFor,
  slotTableSortFactFor,
} from '@/components/tables/compound/slot-table-columns';
import { LOCATION_STOCK_COMPOUND_COLUMNS } from '@/components/inventory/location-stock-grid/location-stock-table-definition';
import { locationStockCompoundView } from '@/components/inventory/location-stock-grid/location-stock-row-view';
import {
  filterLocationStockByRooms,
  locationStockRoomFacets,
  locationStockRowId,
  UNROOMED_FACET_ID,
  type LocationStockTableRow,
} from '@/lib/inventory/location-stock-row';
import {
  LOCATION_STOCK_FAMILY,
  LOCATION_STOCK_FIELD_CATALOG,
  LOCATION_STOCK_PRODUCT_LAYOUT,
} from './location-stock';
import { locationStockLevel, resolveLocationStockSlotValue } from './location-stock-resolve';
import { BINS_FIELD_CATALOG } from './bins';
import { SKU_BINS_FIELD_CATALOG } from './sku-bins';
import { parseSlotLayout } from '../slot-layout';

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

function row(overrides: Partial<LocationStockTableRow> = {}): LocationStockTableRow {
  return {
    location_id: 4120,
    location_name: 'A · R2 · C4',
    location_barcode: 'A0202104',
    room: 'Warehouse',
    row_label: 'R2',
    col_label: 'C4',
    sku: 'LAT5520-A',
    product_title: 'Dell Latitude 5520',
    image_url: 'https://cdn.example.com/lat5520.jpg',
    source: 'bin',
    qty: 12,
    min_qty: 4,
    max_qty: 40,
    last_counted: '2026-09-10T23:04:12.000Z',
    ...overrides,
  };
}

function text(value: CompoundSlotValue | null): string | null {
  return value && value.kind === 'value' ? value.text : null;
}

describe('location-stock catalog', () => {
  it('has unique ids, and every field is family-qualified and bindable', () => {
    const ids = LOCATION_STOCK_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of LOCATION_STOCK_FIELD_CATALOG) {
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.equal(field.family, 'location-stock', `${field.id} is not a location-stock fact`);
      assert.ok(field.id.startsWith('location-stock.'), `${field.id} is not family-qualified`);
    }
  });

  it('parses its product layout, and every binding names a real field', () => {
    const parsed = parseSlotLayout(LOCATION_STOCK_PRODUCT_LAYOUT, LOCATION_STOCK_FIELD_CATALOG);
    assert.equal(parsed.identityFieldId, 'location-stock.location');
    assert.deepEqual(
      parsed.statusBindings.map((b) => b.fieldId),
      ['location-stock.room', 'location-stock.source'],
    );
    assert.deepEqual(
      parsed.subtitleBindings.map((b) => b.fieldId),
      ['location-stock.qty'],
    );
    assert.equal(parsed.amountFieldId, null);
  });

  it('names qty in the shape the line-qty law recognises, and lands it under the title', () => {
    const qty = LOCATION_STOCK_FIELD_CATALOG.find((f) => f.id === 'location-stock.qty');
    assert.ok(qty, 'catalog has no qty fact');
    assert.ok(isLineQtyField(qty), 'qty is not recognised as the line qty');
    // The engine's pin is idempotent on a layout that already obeys it — which
    // is the assertion that the operator's "qty under the product title" is
    // what the default paints, not what a staffer has to re-bind.
    const pinned = ensureLineQtySubtitle(
      LOCATION_STOCK_PRODUCT_LAYOUT,
      LOCATION_STOCK_FIELD_CATALOG,
    );
    assert.deepEqual(pinned, LOCATION_STOCK_PRODUCT_LAYOUT);
    // …and it must never sit in the status band, where it would paint a column.
    assert.ok(
      !LOCATION_STOCK_PRODUCT_LAYOUT.statusBindings.some(
        (b) => b.fieldId === 'location-stock.qty',
      ),
    );
  });

  it('is not the bins overview and not the per-SKU pane', () => {
    const overviewIds = new Set(BINS_FIELD_CATALOG.map((f) => f.id));
    const perSkuIds = new Set(SKU_BINS_FIELD_CATALOG.map((f) => f.id));
    for (const field of LOCATION_STOCK_FIELD_CATALOG) {
      assert.ok(!overviewIds.has(field.id), `${field.id} collides with a bins-overview fact`);
      assert.ok(!perSkuIds.has(field.id), `${field.id} collides with a sku-bins fact`);
      const paths = Object.values(field.paths ?? {});
      for (const aggregate of OVERVIEW_ONLY_COLUMNS) {
        assert.ok(!paths.includes(aggregate), `${field.id} reads the overview aggregate ${aggregate}`);
      }
    }
    // A resolver that answered an aggregate would be reading a fact the feed
    // never selected.
    for (const aggregate of OVERVIEW_ONLY_COLUMNS) {
      assert.equal(resolveLocationStockSlotValue(row(), `location-stock.${aggregate}`), null);
    }
  });
});

describe('location-stock resolution', () => {
  it('resolves the pair facts the desk paints', () => {
    const r = row();
    // The EXACT bin code, in its SEGMENTED form — zone · aisle · bay · level ·
    // position, the order a picker walks (operator 2026-09-15: the id must read
    // with dashes). The room is its own column, never folded into this face.
    assert.equal(
      text(resolveLocationStockSlotValue(r, 'location-stock.location')),
      'A-02-02-1-04',
    );
    assert.equal(
      text(resolveLocationStockSlotValue(r, 'location-stock.item')),
      'Dell Latitude 5520',
    );
    assert.equal(text(resolveLocationStockSlotValue(r, 'location-stock.qty')), '12');
    assert.equal(text(resolveLocationStockSlotValue(r, 'location-stock.room')), 'Warehouse');
    assert.equal(text(resolveLocationStockSlotValue(r, 'location-stock.sku')), 'LAT5520-A');
    // The instant, never a formatted or relative face.
    assert.equal(
      text(resolveLocationStockSlotValue(r, 'location-stock.last_counted')),
      '2026-09-10T23:04:12.000Z',
    );
  });

  it('falls back through the house location coalesce, never to a bare id', () => {
    assert.equal(
      text(
        resolveLocationStockSlotValue(
          row({ location_barcode: null }),
          'location-stock.location',
        ),
      ),
      'Warehouse · A · R2 · C4',
    );
    assert.equal(
      text(
        resolveLocationStockSlotValue(
          row({ location_barcode: null, location_name: null, room: null }),
          'location-stock.location',
        ),
      ),
      'R2C4',
    );
    assert.equal(
      text(
        resolveLocationStockSlotValue(
          row({
            location_barcode: null,
            location_name: null,
            room: null,
            row_label: null,
            col_label: null,
          }),
          'location-stock.location',
        ),
      ),
      '#4120',
    );
  });

  it('keeps the room OUT of the id face — it is a column of its own', () => {
    // A bin with a barcode names itself by that code alone…
    assert.equal(
      text(resolveLocationStockSlotValue(row(), 'location-stock.location')),
      'A-02-02-1-04',
    );
    // …and the room is still resolvable as its own fact, for its own track.
    assert.equal(text(resolveLocationStockSlotValue(row(), 'location-stock.room')), 'Warehouse');
  });

  it('paints the catalog photo in the thumb gutter, and dashes to the placeholder', () => {
    assert.equal(
      locationStockCompoundView(row()).thumbUrl,
      'https://cdn.example.com/lat5520.jpg',
    );
    // NULL, never a fabricated URL: the shared cell paints its typed
    // placeholder, and a broken <img> is the failure that invites one.
    assert.equal(locationStockCompoundView(row({ image_url: null })).thumbUrl, null);
  });

  it('titles itself by the SKU when the catalog has no product, without a note echo', () => {
    const bare = row({ product_title: null });
    assert.equal(text(resolveLocationStockSlotValue(bare, 'location-stock.item')), 'LAT5520-A');
    assert.equal(locationStockCompoundView(bare).title, 'LAT5520-A');
    assert.equal(locationStockCompoundView(bare).note, null);
  });

  it('keeps an unset bound NULL — Number(null) would invent a floor of zero', () => {
    const loose = row({ min_qty: null, max_qty: null });
    assert.equal(text(resolveLocationStockSlotValue(loose, 'location-stock.min_qty')), null);
    assert.equal(text(resolveLocationStockSlotValue(loose, 'location-stock.max_qty')), null);
    // A pair with no bounds is not in breach of one.
    assert.equal(locationStockLevel(loose), 'Stocked');
  });

  it('words the level with the bins-overview predicates, and mints no Empty', () => {
    assert.equal(locationStockLevel(row({ qty: 2, min_qty: 4 })), 'Low');
    assert.equal(locationStockLevel(row({ qty: 41, max_qty: 40 })), 'Over');
    assert.equal(locationStockLevel(row({ qty: 12 })), 'Stocked');
    // The feed selects qty <> 0, so a zero pair cannot reach the desk; the word
    // for it must not exist. A `Low` floor of 0 still reads as the breach it is.
    assert.equal(locationStockLevel(row({ qty: 0, min_qty: 1 })), 'Low');
    // The pill and the bound track are one SoT.
    assert.equal(
      text(resolveLocationStockSlotValue(row({ qty: 2, min_qty: 4 }), 'location-stock.level')),
      locationStockLevel(row({ qty: 2, min_qty: 4 })),
    );
    assert.equal(locationStockCompoundView(row({ qty: 2, min_qty: 4 })).stateLabel, 'Low');
  });

  it('keys a row by location · sku · SOURCE — no part is unique alone', () => {
    assert.equal(locationStockRowId(row()), '4120:LAT5520-A:bin');
    assert.notEqual(locationStockRowId(row({ sku: 'OTHER' })), locationStockRowId(row()));
    assert.notEqual(locationStockRowId(row({ location_id: 9 })), locationStockRowId(row()));
    // The same pair can hold BOTH loose counted stock and standing units, and
    // the two are different rows — a two-part key collapsed them.
    assert.notEqual(locationStockRowId(row({ source: 'unit' })), locationStockRowId(row()));
  });

  it('names an unresolved placement by the handle the floor wrote', () => {
    // `serial_units.current_location` is free text; a place this warehouse has
    // no row for still has to key and still has to paint.
    const stray = row({ location_id: null, location_barcode: null, location_name: '85', room: null, source: 'unit' });
    assert.equal(locationStockRowId(stray), '85:LAT5520-A:unit');
    assert.equal(text(resolveLocationStockSlotValue(stray, 'location-stock.location')), '85');
  });

  it('says HOW the stock is held, because the feed unions two pairings', () => {
    assert.equal(text(resolveLocationStockSlotValue(row(), 'location-stock.source')), 'Bin count');
    assert.equal(
      text(resolveLocationStockSlotValue(row({ source: 'unit' }), 'location-stock.source')),
      'Units',
    );
  });
});

describe('location-stock room facets', () => {
  const rows = [
    row({ location_id: 1, sku: 'A', room: 'Warehouse' }),
    row({ location_id: 2, sku: 'B', room: 'Warehouse' }),
    row({ location_id: 3, sku: 'C', room: 'Annex' }),
    row({ location_id: 4, sku: 'D', room: null }),
    row({ location_id: 5, sku: 'E', room: '   ' }),
  ];

  it('offers exactly the rooms in the feed, counted, in walking order', () => {
    assert.deepEqual(locationStockRoomFacets(rows), [
      { id: 'Warehouse', label: 'Warehouse', count: 2 },
      { id: 'Annex', label: 'Annex', count: 1 },
      { id: UNROOMED_FACET_ID, label: 'No room', count: 2 },
    ]);
  });

  it('counts every row, so the menu adds up to the table total', () => {
    const total = locationStockRoomFacets(rows).reduce((sum, f) => sum + f.count, 0);
    assert.equal(total, rows.length);
  });

  it('reads a cleared funnel as the whole warehouse, not as nothing', () => {
    assert.equal(filterLocationStockByRooms(rows, []), rows);
  });

  it('narrows to the selected rooms, and the no-room bucket is selectable', () => {
    assert.deepEqual(
      filterLocationStockByRooms(rows, ['Annex']).map((r) => r.sku),
      ['C'],
    );
    assert.deepEqual(
      filterLocationStockByRooms(rows, ['Warehouse', 'Annex']).map((r) => r.sku),
      ['A', 'B', 'C'],
    );
    assert.deepEqual(
      filterLocationStockByRooms(rows, [UNROOMED_FACET_ID]).map((r) => r.sku),
      ['D', 'E'],
    );
  });
});

describe('location-stock materialization', () => {
  it('mounts the shared compound skeleton WHOLE, plus its two status slots', () => {
    const keys = LOCATION_STOCK_COMPOUND_COLUMNS.map((c) => c.key);
    for (const chrome of COMPOUND_COLUMN_KEYS) {
      assert.ok(keys.includes(chrome), `skeleton track ${chrome} was cut`);
    }
    assert.deepEqual(
      keys.filter((k) => k.startsWith('status:')),
      ['status:1', 'status:2'],
    );
    // Compound paints subtitles inside the item cell — a subtitle TRACK here
    // would mean the count became a column.
    assert.deepEqual(keys.filter((k) => k.startsWith('subtitle:')), []);
  });

  it('gives every painted DATA header a live sort fact', () => {
    for (const col of LOCATION_STOCK_COMPOUND_COLUMNS) {
      if (isSlotTableChromeTrack(col.key)) {
        assert.equal(
          slotTableSortFactFor(LOCATION_STOCK_FAMILY, col),
          null,
          `${col.key} is chrome and must not sort`,
        );
        continue;
      }
      assert.ok(
        slotTableSortFactFor(LOCATION_STOCK_FAMILY, col),
        `${col.key} paints a fact with a dead header`,
      );
    }
  });

  it('renames the shared chrome into this desk vocabulary', () => {
    const label = (key: string) =>
      LOCATION_STOCK_COMPOUND_COLUMNS.find((c) => c.key === key)?.gridLabel;
    // The identity header is the ENGINE's `Id` on every peer since
    // 2026-09-15 (`slot-table-id-header-law.ts`); this desk used to print
    // "Location", which is now the Fields-picker word and the cell's hover word.
    // Pinned by slot-table-id-header-law.test.ts, not re-pinned here.
    assert.equal(label('fulfillment'), 'Id');
    assert.equal(label('item'), 'Item');
    assert.equal(label('state'), 'Level');
    assert.equal(label('dates'), 'Counted');
  });

  it('re-keys the status band densely when an org binds a different set', () => {
    const columns = slotTableColumnsFor(LOCATION_STOCK_FAMILY, {
      ...LOCATION_STOCK_PRODUCT_LAYOUT,
      statusBindings: [
        { fieldId: 'location-stock.min_qty' },
        { fieldId: 'location-stock.max_qty' },
        { fieldId: 'location-stock.room' },
      ],
    });
    const band = columns.filter((c) => c.key.startsWith('status:'));
    assert.deepEqual(band.map((c) => c.key), ['status:1', 'status:2', 'status:3']);
    assert.deepEqual(band.map((c) => c.fieldId), [
      'location-stock.min_qty',
      'location-stock.max_qty',
      'location-stock.room',
    ]);
  });
});
