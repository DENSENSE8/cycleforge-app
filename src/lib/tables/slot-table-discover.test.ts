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

  it('every family mounts the engine — no flat GRID array survives', () => {
    // Wave B deleted the last hand `*_GRID_COLUMNS` arrays (receiving,
    // incoming, tasks, import-exception) and the row/descriptor defaults that
    // re-SoT'd them by silence. Both scanners are now regression guards: a hit
    // means a NEW second column model was minted on one engine.
    const flatMounts = [...report.delete, ...report.judgment].filter(
      (f) => f.scanner === 'flat-mount',
    );
    assert.deepEqual(
      flatMounts.map((f) => f.id),
      [],
      `a desk mounts a hand flat GRID array again — mount the family materialization instead:\n${flatMounts
        .map((f) => `${f.path} → ${f.symbol}`)
        .join('\n')}`,
    );

    const handArrays = report.delete.filter((f) => f.scanner === 'hand-grid-export');
    assert.deepEqual(
      handArrays.map((f) => f.symbol),
      [],
      'a new hand *_GRID_COLUMNS array exists beside a family materialization',
    );
  });

  it('no mechanical delete remains — what is left needs an operator ruling', () => {
    assert.equal(
      nextDeleteGap(report),
      null,
      'a mechanical DELETE reappeared; the Wave B ratchet only moves down',
    );
    for (const f of report.judgment) {
      assert.ok(
        SLOT_TABLE_KNOWN_DEBT.includes(f.id),
        `judgment row ${f.id} is not in the ratchet — get an operator ruling`,
      );
    }
  });

  it('FBA catalog and the table-columns zombie are judgment — not auto-delete', () => {
    const j = new Set(report.judgment.map((f) => f.id));
    assert.ok(j.has('catalog-orphan:fba:FBA_FIELD_CATALOG'));
    assert.ok(j.has('table-columns-zombie:support-tickets'));
    assert.ok(!report.delete.some((f) => f.symbol === 'FBA_FIELD_CATALOG'));
  });

  it('the station benches are registered families — no third engine survives', () => {
    // Wave C: `tech` and `packer` joined PRODUCT_TABLES / REGISTERED_BINDINGS,
    // so the hand STATION_HISTORY_COLUMNS array and StationQueueRow are gone.
    // The out-of-waist scanner is now generic; a hit means a NEW hand column
    // model was minted outside the waist.
    const outOfWaist = report.judgment.filter((f) => f.scanner === 'out-of-waist-hand-model');
    assert.deepEqual(
      outOfWaist.map((f) => `${f.path} → ${f.symbol}`),
      [],
      'a hand column array reappeared outside PRODUCT_TABLES / REGISTERED_BINDINGS',
    );
  });
});
