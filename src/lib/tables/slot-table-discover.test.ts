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
      'engine:CompoundState',
      'engine:DateRangePickerField',
      'engine:useSlotTableLayout',
      'engine:materializeTracks',
      'engine:DataTable',
      'engine:DataTableFilterMenu',
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

  it('Testing History is on the engine — the receiving dual-SoT is closed', () => {
    const flat = [...report.delete, ...report.judgment].find(
      (f) => f.id === 'flat-mount:receiving:TestingHistoryList',
    );
    assert.ok(
      !flat,
      'Testing History regressed to the flat RECEIVING_GRID_COLUMNS mount — remount RECEIVING_COMPOUND_COLUMNS (tableId `testing`)',
    );
    const hand = report.delete.find(
      (f) => f.id === 'hand-grid-export:receiving:RECEIVING_GRID_COLUMNS',
    );
    assert.ok(hand, 'the flat array still exists — Wave B owes its delete');
    assert.deepEqual(
      hand.blockedBy,
      [],
      'flat-mount blocker is gone; RECEIVING_GRID_COLUMNS is unblocked for Wave B',
    );
  });

  it('next unblocked delete is mechanical (not judgment)', () => {
    const next = nextDeleteGap(report);
    assert.ok(next, 'expected at least one unblocked delete');
    assert.equal(next.verdict, 'delete');
    assert.ok(next.priority <= 2);
    assert.equal(next.blockedBy.length, 0);
    assert.equal(
      next.scanner,
      'hand-grid-export',
      'prefer unused hand GRID arrays over live-mount work',
    );
  });

  it('FBA catalog and station-history are judgment — not auto-delete', () => {
    const j = new Set(report.judgment.map((f) => f.id));
    assert.ok(j.has('catalog-orphan:fba:FBA_FIELD_CATALOG'));
    assert.ok(j.has('out-of-waist-hand-model:station-history:STATION_HISTORY_COLUMNS'));
    assert.ok(!report.delete.some((f) => f.symbol === 'FBA_FIELD_CATALOG'));
    assert.ok(!report.delete.some((f) => f.symbol === 'STATION_HISTORY_COLUMNS'));
  });
});
