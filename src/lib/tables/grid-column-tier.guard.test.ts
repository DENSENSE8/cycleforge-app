/**
 * Cross-family guard for the grid column TIER contract.
 *
 * Every Workbench spreadsheet resolves its visible tracks through one rule
 * (`resolveGridColumns`). That rule is only safe if the column models obey two
 * invariants, and both are easy to break by hand in a layout SoT:
 *
 *  1. `tier: 'optional'` REQUIRES a `hideKey`. `hideKey` is the only channel a
 *     staffer can opt in through, so an optional column without one is
 *     permanently invisible — a column that silently never renders.
 *  2. Structural columns (`select`, `title`) must carry NO `hideKey` and NO
 *     `tier`. They are the frozen identity pane; offering them in the Fields
 *     menu would let a staffer hide the checkbox gutter or the product title.
 *
 * It also pins each surface's DEFAULT (core) set, so making a column optional —
 * which changes what every staffer sees on their next load — is a deliberate,
 * reviewed edit rather than a one-character drive-by.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import { RECEIVING_GRID_COLUMNS } from '@/lib/receiving/receiving-grid-layout';
import { INCOMING_GRID_COLUMNS } from '@/lib/receiving/incoming-grid-layout';
import { ORDERS_QUEUE_COLUMNS } from '@/lib/dashboard-order-row-layout';
import { CATALOG_GRID_COLUMNS } from '@/lib/products/catalog-grid-layout';
import { PICKUP_GRID_COLUMNS } from '@/components/receiving/pickup/grid/pickup-grid-layout';
import { REPAIR_GRID_COLUMNS } from '@/lib/repair/repair-grid-layout';

/** Keys that are structural on every family — never hideable, never tiered. */
const STRUCTURAL = new Set(['select', 'title']);

const FAMILIES: Record<string, readonly LedgerGridColumnModel[]> = {
  receiving: RECEIVING_GRID_COLUMNS,
  incoming: INCOMING_GRID_COLUMNS,
  orders: ORDERS_QUEUE_COLUMNS,
  catalog: CATALOG_GRID_COLUMNS,
  pickup: PICKUP_GRID_COLUMNS,
  repair: REPAIR_GRID_COLUMNS,
};

const coreKeys = (columns: readonly LedgerGridColumnModel[]) =>
  columns.filter((c) => c.tier !== 'optional').map((c) => c.key);

describe('grid column tier contract', () => {
  for (const [name, columns] of Object.entries(FAMILIES)) {
    it(`${name}: every optional column can actually be opted into`, () => {
      for (const c of columns) {
        if (c.tier !== 'optional') continue;
        assert.ok(
          c.hideKey,
          `${name}.${c.key} is tier:'optional' but has no hideKey — it could never be turned on`,
        );
      }
    });

    it(`${name}: structural columns are never hideable`, () => {
      for (const c of columns) {
        if (!STRUCTURAL.has(c.key)) continue;
        assert.equal(c.hideKey, undefined, `${name}.${c.key} must not carry a hideKey`);
        assert.equal(c.tier, undefined, `${name}.${c.key} must not carry a tier`);
      }
    });

    it(`${name}: column keys are unique`, () => {
      const keys = columns.map((c) => c.key);
      assert.equal(new Set(keys).size, keys.length, `${name} has duplicate column keys`);
    });
  }
});

describe('default (core) column sets — change these deliberately', () => {
  // Receiving is the surface the lean default was designed around: what is it,
  // when did it land, how many, where in the flow, and the two identifiers an
  // operator scans. condition / platform / serial are opt-in because they are
  // usually still empty at the moment the row is scanned.
  it('receiving ships the lean scan set', () => {
    assert.deepEqual(coreKeys(RECEIVING_GRID_COLUMNS), [
      'select',
      'title',
      'date',
      'qty',
      'stage',
      'location',
      'order',
      'tracking',
    ]);
  });

  // Catalog is a product LIST first: what it is, how it is keyed, whether it is
  // wired to the inventory master, and whether it needs attention. The four
  // roll-up COUNTS (channels · manuals · qc · orders) are drill-down analytics,
  // so they opt in rather than turning first load into a numbers table.
  it('catalog ships the lean product set', () => {
    assert.deepEqual(coreKeys(CATALOG_GRID_COLUMNS), [
      'select',
      'title',
      'sku',
      'inventory',
      'status',
    ]);
  });

  // Pickup answers the counter operator's four questions: what, which LCPU
  // order, when, still Draft? Line detail (sku · qty · cond · price) is rolled
  // up by the group summary and shown in full by the detail pane.
  it('pickup ships the lean counter set', () => {
    assert.deepEqual(coreKeys(PICKUP_GRID_COLUMNS), [
      'select',
      'title',
      'order',
      'date',
      'status',
    ]);
  });

  // Repair: what came in, when, whose it is, and the RS-#### the desk quotes.
  // phone is contact detail behind the ticket, price is a quote the detail pane
  // owns, and `order` reads "Walk-in" on almost every row.
  it('repair ships the lean desk set', () => {
    assert.deepEqual(coreKeys(REPAIR_GRID_COLUMNS), [
      'select',
      'title',
      'date',
      'customer',
      'ticket',
    ]);
  });

  it('every family keeps its frozen identity pane in the default set', () => {
    for (const [name, columns] of Object.entries(FAMILIES)) {
      const core = coreKeys(columns);
      for (const key of STRUCTURAL) {
        if (!columns.some((c) => c.key === key)) continue;
        assert.ok(core.includes(key), `${name} dropped structural column ${key} from its default`);
      }
    }
  });

  it('no family defaults to an empty grid', () => {
    for (const [name, columns] of Object.entries(FAMILIES)) {
      // Structural columns alone are not a usable grid — at least one FACT
      // track must ship on by default or the surface opens blank.
      const factCore = coreKeys(columns).filter((k) => !STRUCTURAL.has(k));
      assert.ok(factCore.length > 0, `${name} has no core fact columns — it would open blank`);
    }
  });
});
