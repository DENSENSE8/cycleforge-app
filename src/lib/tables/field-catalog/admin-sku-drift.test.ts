/**
 * SKU stock-drift catalog guards, materialization and adapter behaviour — the
 * family that replaced `_inventory-admin/TableSections.tsx`'s seven
 * hand-written `AdminTableColumn` objects.
 *
 * Four assertions here are load-bearing beyond the usual shape checks:
 *
 * - the FOUR-BINDING CEILING. Seven facts against a whole skeleton leaves
 *   exactly four status slots, so the two Δ facts ride the title and the pill.
 *   A fifth binding fails `parseTableDefinition` at module load — this test
 *   says so before the build does.
 * - the FACT-FREE DATES TRACK. `v_sku_stock_drift` is a read-time join with no
 *   stamp of any kind. The track keeps its geometry (the skeleton is never cut)
 *   and declares a blank header with no sort, rather than a labelled header
 *   with a dead click or an invented timestamp.
 * - the SIGNED VALUE, not a colour. The retired Δ cells painted red when
 *   non-zero; the direction now lives in the words the title and the pill
 *   carry, and no field encodes paint.
 * - the ORG NON-GOAL. `organization_id` is selected by the view, scoped by the
 *   loader, and painted by nothing.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';
import { MAX_DEFAULT_VISIBLE_TRACKS } from '@/lib/tables/table-definition';
import {
  ADMIN_SKU_DRIFT_COMPOUND_COLUMNS,
  adminSkuDriftCompoundColumnsFor,
  adminSkuDriftSortFactFor,
} from '@/components/inventory/drift-grid/admin-sku-drift-grid-layout';
import { adminSkuDriftCompoundView } from '@/components/inventory/drift-grid/admin-sku-drift-row-view';
import type { SkuDriftRow } from '@/lib/inventory/drift-rows';
import {
  ADMIN_SKU_DRIFT_FIELD_CATALOG,
  ADMIN_SKU_DRIFT_PRODUCT_LAYOUT,
} from './admin-sku-drift';
import { resolveAdminSkuDriftSlotValue } from './admin-sku-drift-resolve';
import { parseSlotLayout } from '../slot-layout';

/** Selected by the view, scoped by the loader, painted by nothing. */
const UNPAINTED_VIEW_COLUMNS = ['organization_id'] as const;

function row(overrides: Partial<SkuDriftRow> = {}): SkuDriftRow {
  return {
    sku: 'DELL-7050-I5',
    stored_stock: 3,
    ledger_warehouse: 5,
    warehouse_drift: -2,
    stored_boxed: 4,
    ledger_boxed: 4,
    boxed_drift: 0,
    ...overrides,
  };
}

describe('admin-sku-drift catalog', () => {
  it('has unique ids, and every field is family-qualified and bindable', () => {
    const ids = ADMIN_SKU_DRIFT_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of ADMIN_SKU_DRIFT_FIELD_CATALOG) {
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.equal(field.family, 'admin-sku-drift', `${field.id} is not a SKU-drift fact`);
      assert.ok(field.id.startsWith('admin-sku-drift.'), `${field.id} is not family-qualified`);
    }
  });

  it('names the SEVEN facts the seven retired cells painted, and no others', () => {
    assert.deepEqual(
      ADMIN_SKU_DRIFT_FIELD_CATALOG.map((f) => f.id),
      [
        'admin-sku-drift.sku',
        'admin-sku-drift.warehouse_drift',
        'admin-sku-drift.boxed_drift',
        'admin-sku-drift.stored_warehouse',
        'admin-sku-drift.ledger_warehouse',
        'admin-sku-drift.stored_boxed',
        'admin-sku-drift.ledger_boxed',
      ],
    );
  });

  it('does NOT name the org scope column — the loader scopes, no cell paints', () => {
    for (const field of ADMIN_SKU_DRIFT_FIELD_CATALOG) {
      const paths = Object.values(field.paths ?? {});
      for (const unpainted of UNPAINTED_VIEW_COLUMNS) {
        assert.ok(
          !paths.includes(unpainted),
          `${field.id} reads '${unpainted}', a column no cell paints`,
        );
      }
    }
    for (const unpainted of UNPAINTED_VIEW_COLUMNS) {
      assert.equal(resolveAdminSkuDriftSlotValue(row(), `admin-sku-drift.${unpainted}`), null);
    }
  });

  it('no field encodes the retired red wash — a drift is a number, not a colour', () => {
    // Every fact on this desk is a COUNT. A `tag` here would mean somebody had
    // re-encoded the wash as a tone vocabulary ("drifting" / "clean") and given
    // an org a column to bind paint into.
    for (const field of ADMIN_SKU_DRIFT_FIELD_CATALOG) {
      if (field.id === 'admin-sku-drift.sku') continue;
      assert.equal(field.displayType, 'number', `${field.id} is a quantity, not a vocabulary`);
    }
    // The two drift facts resolve to signed NUMBERS, so their columns order
    // numerically instead of by a decorated string.
    for (const id of ['admin-sku-drift.warehouse_drift', 'admin-sku-drift.boxed_drift']) {
      const field = ADMIN_SKU_DRIFT_FIELD_CATALOG.find((f) => f.id === id);
      assert.equal(field?.displayType, 'number');
    }
  });

  it('product default parses, and the SKU is the identity', () => {
    const parsed = parseSlotLayout(ADMIN_SKU_DRIFT_PRODUCT_LAYOUT, ADMIN_SKU_DRIFT_FIELD_CATALOG);
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'admin-sku-drift.sku');
    // The four stored/ledger counters are the bound band…
    assert.deepEqual(
      parsed.statusBindings.map((b) => b.fieldId),
      [
        'admin-sku-drift.stored_warehouse',
        'admin-sku-drift.ledger_warehouse',
        'admin-sku-drift.stored_boxed',
        'admin-sku-drift.ledger_boxed',
      ],
    );
    // …and nothing rides a second line under the title, because the counters
    // are already tracks.
    assert.deepEqual(parsed.subtitleBindings, []);
    assert.equal(parsed.amountFieldId ?? null, null);
  });

  it('binds exactly FOUR status tracks — the whole skeleton leaves no more', () => {
    assert.equal(ADMIN_SKU_DRIFT_PRODUCT_LAYOUT.statusBindings.length, 4);
    const painted = ADMIN_SKU_DRIFT_COMPOUND_COLUMNS.filter((c) => c.key !== 'select');
    // Exactly at the dense ceiling: a fifth binding throws in
    // `parseTableDefinition` at module load.
    assert.equal(painted.length, MAX_DEFAULT_VISIBLE_TRACKS);
  });

  it('leaves the two Δ facts UNBOUND but still bindable', () => {
    const bound = new Set([
      ADMIN_SKU_DRIFT_PRODUCT_LAYOUT.identityFieldId,
      ...ADMIN_SKU_DRIFT_PRODUCT_LAYOUT.statusBindings.map((b) => b.fieldId),
      ...ADMIN_SKU_DRIFT_PRODUCT_LAYOUT.subtitleBindings.map((b) => b.fieldId),
    ]);
    const unbound = ADMIN_SKU_DRIFT_FIELD_CATALOG.filter((f) => !bound.has(f.id)).map((f) => f.id);
    // The title and the state pill paint these two.
    assert.deepEqual(unbound, [
      'admin-sku-drift.warehouse_drift',
      'admin-sku-drift.boxed_drift',
    ]);
    for (const id of unbound) {
      const field = ADMIN_SKU_DRIFT_FIELD_CATALOG.find((f) => f.id === id);
      assert.ok(field?.slotKinds.includes('status'), `${id} cannot be opted into a track`);
    }
  });
});

describe('admin-sku-drift materialization', () => {
  it('mounts the SHARED compound skeleton WHOLE, in its order', () => {
    const chrome = ADMIN_SKU_DRIFT_COMPOUND_COLUMNS.map((c) => String(c.key)).filter(
      (k) => !k.startsWith('status:') && !k.startsWith('subtitle:'),
    );
    assert.deepEqual(chrome, [...COMPOUND_COLUMN_KEYS]);
    // Compound paints subtitles INSIDE the item cell — never as tracks.
    assert.equal(
      ADMIN_SKU_DRIFT_COMPOUND_COLUMNS.filter((c) => String(c.key).startsWith('subtitle:')).length,
      0,
    );
    assert.equal(
      ADMIN_SKU_DRIFT_COMPOUND_COLUMNS.filter((c) => String(c.key).startsWith('status:')).length,
      ADMIN_SKU_DRIFT_PRODUCT_LAYOUT.statusBindings.length,
    );
  });

  it('relabels the chrome it paints facts into', () => {
    const col = (key: string) => ADMIN_SKU_DRIFT_COMPOUND_COLUMNS.find((c) => c.key === key);
    assert.equal(col('item')?.label, 'Δ WH');
    assert.equal(col('state')?.label, 'Δ Boxed');
    const identity = col('fulfillment');
    assert.equal(identity?.fieldId, 'admin-sku-drift.sku');
    // The identity header is the ENGINE's `Id` on every peer since 2026-09-15
    // (`slot-table-id-header-law.ts`). "SKU" is now the Fields-picker row
    // and the cell's hover word, not the column header.
    assert.equal(identity?.label, 'Id');
    assert.equal(identity?.type, 'id');
  });

  it('mounts the DATES track fact-free: geometry kept, header blank, no sort', () => {
    const dates = ADMIN_SKU_DRIFT_COMPOUND_COLUMNS.find((c) => c.key === 'dates');
    assert.ok(dates, 'the skeleton must mount whole — dates is never dropped');
    // `''` means PRINT NOTHING HERE (the `select` / `_fill` convention), which
    // is different from an unlabeled fact.
    assert.equal(dates?.gridLabel, '');
    assert.equal(dates?.sortable, false);
    assert.equal(dates?.fieldId, undefined);
    // A read-time join has no instant to offer, so the header refuses.
    assert.equal(adminSkuDriftSortFactFor({ key: 'dates', sortable: false }), null);
    // And the adapter paints neither DATES line rather than inventing one.
    const view = adminSkuDriftCompoundView(row());
    assert.equal(view.orderedAt, null);
    assert.equal(view.delay, null);
  });

  it('rebinds without changing track keys (keys are slot indices)', () => {
    const columns = adminSkuDriftCompoundColumnsFor({
      ...ADMIN_SKU_DRIFT_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'admin-sku-drift.warehouse_drift' }],
    });
    const slots = columns.filter((c) => String(c.key).startsWith('status:'));
    assert.deepEqual(
      slots.map((c) => c.key),
      ['status:1'],
    );
    assert.equal(slots[0]?.fieldId, 'admin-sku-drift.warehouse_drift');
  });

  it('every painted DATA header sorts; chrome and the fact-free track stay dead', () => {
    for (const col of ADMIN_SKU_DRIFT_COMPOUND_COLUMNS) {
      if (isSlotTableChromeTrack(col.key) || col.sortable === false) {
        assert.equal(adminSkuDriftSortFactFor(col), null, `${col.key} carries no fact`);
        continue;
      }
      assert.ok(
        adminSkuDriftSortFactFor(col) !== null,
        `${col.key} is a painted data track with a dead header`,
      );
    }
    assert.equal(adminSkuDriftSortFactFor({ key: 'fulfillment' }), 'admin-sku-drift.sku');
    assert.equal(adminSkuDriftSortFactFor({ key: 'item' }), 'admin-sku-drift.warehouse_drift');
    assert.equal(adminSkuDriftSortFactFor({ key: 'state' }), 'admin-sku-drift.boxed_drift');
  });
});

describe('admin-sku-drift resolver', () => {
  it('answers every catalog id off a realistic row', () => {
    for (const field of ADMIN_SKU_DRIFT_FIELD_CATALOG) {
      assert.notEqual(
        resolveAdminSkuDriftSlotValue(row(), field.id),
        null,
        `${field.id} is in the catalog and the resolver cannot read it`,
      );
    }
  });

  it('resolves each counter BARE and signed so a number column sorts numerically', () => {
    assert.deepEqual(resolveAdminSkuDriftSlotValue(row(), 'admin-sku-drift.warehouse_drift'), {
      kind: 'value',
      text: '-2',
    });
    assert.deepEqual(resolveAdminSkuDriftSlotValue(row(), 'admin-sku-drift.stored_warehouse'), {
      kind: 'value',
      text: '3',
    });
    assert.deepEqual(resolveAdminSkuDriftSlotValue(row(), 'admin-sku-drift.ledger_warehouse'), {
      kind: 'value',
      text: '5',
    });
  });

  it('resolves ZERO as a fact, never as an absence', () => {
    // This desk exists to compare counters; a dashed zero would read as "not
    // fetched" beside a signed neighbour.
    assert.deepEqual(resolveAdminSkuDriftSlotValue(row(), 'admin-sku-drift.boxed_drift'), {
      kind: 'value',
      text: '0',
    });
  });

  it('knows nothing about a field id from another family', () => {
    assert.equal(resolveAdminSkuDriftSlotValue(row(), 'admin-drift-alerts.sku'), null);
  });
});

describe('admin-sku-drift row view', () => {
  it('spells the DIRECTION into the title and the pill, never into a colour', () => {
    const view = adminSkuDriftCompoundView(row());
    assert.equal(view.id, 'DELL-7050-I5');
    assert.equal(view.orderId, 'DELL-7050-I5');
    // Warehouse is out by two the other way; boxed reconciles.
    assert.equal(view.title, 'Warehouse -2');
    assert.equal(view.stateLabel, 'Boxed in sync');
    assert.equal(view.stateTone, 'done');
    assert.equal(view.note, null);
    assert.equal(view.tracking, null);
    assert.equal(view.platformValue, null);
    assert.equal(view.amount, null);
    assert.equal(view.thumbUrl, null);
  });

  it('keeps the retired `+` prefix on a positive drift', () => {
    const view = adminSkuDriftCompoundView(row({ warehouse_drift: 2, boxed_drift: 1 }));
    assert.equal(view.title, 'Warehouse +2');
    assert.equal(view.stateLabel, 'Boxed +1');
    assert.equal(view.stateTone, 'alert');
  });

  it('says "in sync" rather than 0 for the dimension that reconciles', () => {
    // A row is on this desk when EITHER dimension drifts, so a clean dimension
    // is a real answer and must not read as missing data.
    const view = adminSkuDriftCompoundView(row({ warehouse_drift: 0, boxed_drift: -3 }));
    assert.equal(view.title, 'Warehouse in sync');
    assert.equal(view.stateLabel, 'Boxed -3');
    assert.equal(view.stateTone, 'alert');
  });
});
