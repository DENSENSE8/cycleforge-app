/**
 * Tripwire — slot-table discover (delete vs keep).
 *
 * Run: node --import tsx --test src/lib/tables/slot-table-discover.test.ts
 */

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  SLOT_TABLE_KNOWN_DEBT,
  assertKnownDebtRatchet,
  discoverSlotTable,
  nextDeleteGap,
} from './slot-table-discover';

const ROOT = process.cwd();

describe('slot-table discover (delete vs keep)', () => {
  const report = discoverSlotTable(ROOT);

  it('KEEP engine paths exist on disk', () => {
    const required = [
      'engine:CompoundItem',
      'engine:ProductTitleLink',
      'engine:CompoundState',
      'engine:DateRangePickerField',
      'engine:useOptimisticMutation',
      'engine:useSlotTableLayout',
      'engine:materializeTracks',
      'engine:DataTable',
      'engine:DataTableFilterMenu',
      'engine:slot-table-header-sort',
      'engine:queueSortForColumnKey',
      'engine:LedgerGridColumnHeader',
      'engine:PRODUCT_TABLES',
      'engine:REGISTERED_BINDINGS',
      'engine:TABLE_COLUMNS-keys',
    ];
    const ids = new Set(report.keep.map((k) => k.id));
    for (const id of required) {
      assert.ok(ids.has(id), `missing KEEP ${id}`);
    }
    for (const k of report.keep) {
      if (k.path === 'src/lib/tables/field-catalog') continue;
      assert.ok(existsSync(join(ROOT, k.path)), `KEEP path missing: ${k.path} (${k.id})`);
    }
  });

  it('KEEP includes a materialization for every PRODUCT_TABLES peer on the engine', () => {
    assert.ok(
      report.keep.some((k) => k.id === 'materialization:INCOMING_COMPOUND_COLUMNS'),
      'INCOMING_COMPOUND_COLUMNS shares the receiving-grid-layout file — must still be KEEP',
    );
    assert.ok(
      report.keep.some((k) => k.id === 'materialization:ORDERS_COMPOUND_COLUMNS'),
      'ORDERS_COMPOUND_COLUMNS is the replacement, not a kill',
    );
    assert.ok(
      report.keep.some((k) => k.id === 'engine:CART_COMPOUND_COLUMNS'),
      'kiosk cart is keep-until-opt-in, not a GRID kill',
    );
  });

  it('does not list KEEP symbols as DELETE', () => {
    const keepIds = new Set(report.keep.map((k) => k.id));
    for (const f of report.delete) {
      assert.ok(!keepIds.has(f.id), `DELETE ${f.id} collides with KEEP`);
    }
  });

  it('known-debt ratchet: no new drifts, no stale ids', () => {
    const ratchet = assertKnownDebtRatchet(report);
    assert.deepEqual(
      ratchet.extra,
      [],
      `NEW drift(s) — do not append to KNOWN_DEBT to go green. Fix or get an operator ruling:\n${ratchet.extra.join('\n')}`,
    );
    assert.deepEqual(
      ratchet.stale,
      [],
      `Debt cleared — remove from SLOT_TABLE_KNOWN_DEBT (ratchet down):\n${ratchet.stale.join('\n')}`,
    );
    assert.ok(SLOT_TABLE_KNOWN_DEBT.length >= 1);
  });

  it('has no unblocked hand-model deletes after the compound port', () => {
    const next = nextDeleteGap(report);
    assert.equal(next, null);
  });

  it('keeps only documented non-product table judgment items', () => {
    const j = new Set(report.judgment.map((f) => f.id));
    assert.ok(j.has('catalog-orphan:fba:FBA_FIELD_CATALOG'));
    assert.ok(j.has('table-columns-zombie:support-tickets'));
    assert.ok(!j.has('out-of-waist-hand-model:station-history:STATION_HISTORY_COLUMNS'));
    assert.ok(!report.delete.some((f) => f.symbol === 'FBA_FIELD_CATALOG'));
  });
});
