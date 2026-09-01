/**
 * Tripwire — slot-table cohort (engine + PRODUCT_TABLES).
 *
 * Run: node --import tsx --test src/lib/tables/slot-table-cohort.test.ts
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { PRODUCT_TABLES } from '@/lib/tables/table-catalog';
import {
  SLOT_TABLE_ENGINE,
  SLOT_TABLE_ENGINE_CONTRACT,
  SLOT_TABLE_ENGINE_LAYOUT_HOOKS,
  SLOT_TABLE_PAINT_LAW,
  slotTableEngineContractSource,
  slotTableEnginePeerIds,
  slotTablePeerIds,
} from './slot-table-cohort';

const ROOT = join(process.cwd());

function read(rel: string): string {
  const abs = join(ROOT, rel);
  assert.ok(existsSync(abs), `missing ${rel}`);
  return readFileSync(abs, 'utf8');
}

describe('slot-table cohort (SoT = engine + PRODUCT_TABLES)', () => {
  it('peers are exactly PRODUCT_TABLES ids (no hand list)', () => {
    assert.deepEqual(
      slotTablePeerIds(),
      PRODUCT_TABLES.map((t) => t.tableId),
    );
    assert.ok(slotTablePeerIds().includes('orders'));
    assert.ok(slotTablePeerIds().length >= 15);
  });

  it('every engine layout hook file exists and imports useSlotTableLayout', () => {
    for (const hook of SLOT_TABLE_ENGINE_LAYOUT_HOOKS) {
      const src = read(hook.path);
      assert.match(
        src,
        /useSlotTableLayout/,
        `${hook.tableId}: ${hook.path} must wrap useSlotTableLayout`,
      );
      assert.ok(
        slotTablePeerIds().includes(hook.tableId),
        `${hook.tableId} must be a PRODUCT_TABLES peer`,
      );
    }
  });

  it('engine peers are a subset of PRODUCT_TABLES (opt-in map)', () => {
    const peers = new Set(slotTablePeerIds());
    for (const id of slotTableEnginePeerIds()) {
      assert.ok(peers.has(id), `engine peer ${id} missing from PRODUCT_TABLES`);
    }
  });

  it('CompoundItem title + Listing chip satisfy paint contract', () => {
    const src = read(SLOT_TABLE_ENGINE.compoundCells);
    for (const [name, re] of Object.entries(SLOT_TABLE_ENGINE_CONTRACT)) {
      const rel = slotTableEngineContractSource(name as keyof typeof SLOT_TABLE_ENGINE_CONTRACT);
      if (rel !== SLOT_TABLE_ENGINE.compoundCells) continue;
      assert.match(src, re, `CompoundCells missing ${name}`);
    }
    assert.doesNotMatch(
      src,
      /titleHref[\s\S]{0,200}className=\{cn\(\s*'min-w-0 truncate text-text-info(?!\s+hover)/,
      'title must not be standing text-text-info without idle default',
    );
    assert.doesNotMatch(src, /function CompoundShipByEditor/, 'hand-rolled ship-by editor is gone');
    assert.doesNotMatch(src, /type=["']date["']/, 'no native date input on the compound engine');
    assert.doesNotMatch(
      src,
      /<InlineEditableValue[\s/>]/,
      'dates are DateRangePickerField, not InlineEditableValue',
    );
  });

  it('engine seam files export the shared hooks', () => {
    assert.match(read(SLOT_TABLE_ENGINE.useSlotTableLayout), SLOT_TABLE_ENGINE_CONTRACT.useSlotTableLayoutExport);
    assert.match(read(SLOT_TABLE_ENGINE.materializeTracks), SLOT_TABLE_ENGINE_CONTRACT.materializeTracksExport);
  });

  it('compact DateRangePickerField is the ship-by surface', () => {
    const src = read(SLOT_TABLE_ENGINE.dateRangePickerField);
    assert.match(src, SLOT_TABLE_ENGINE_CONTRACT.dateFieldCompactDecl);
    assert.match(src, SLOT_TABLE_ENGINE_CONTRACT.dateFieldNoYearFace);
    assert.match(src, /variant === ['"]compact['"]/);
  });

  it('ship-by writes through useOptimisticMutation', () => {
    assert.match(read(SLOT_TABLE_ENGINE.useOrderAssignment), SLOT_TABLE_ENGINE_CONTRACT.assignOptimistic);
  });

  it('paint law constants document cohort scope (not To-ship alone)', () => {
    assert.match(SLOT_TABLE_PAINT_LAW.scope, /PRODUCT_TABLES/);
    assert.doesNotMatch(SLOT_TABLE_PAINT_LAW.scope, /^To-ship/);
    assert.match(SLOT_TABLE_PAINT_LAW.shipBy, /DateRangePickerField/);
    assert.match(SLOT_TABLE_PAINT_LAW.shipBy, /compact/);
    assert.match(SLOT_TABLE_PAINT_LAW.shipBy, /useOptimisticMutation/);
    assert.match(SLOT_TABLE_PAINT_LAW.filter, /DataTableFilterMenu/);
    assert.match(SLOT_TABLE_PAINT_LAW.filter, /DATA_TABLE_FILTER_IDLE/);
  });

  it('graph + critique surfaces include compact ship-by', () => {
    const symbols = SLOT_TABLE_ENGINE.graphSymbols as readonly string[];
    for (const name of ['CompoundState', 'DateRangePickerField', 'useOptimisticMutation']) {
      assert.ok(symbols.includes(name), `graphSymbols missing ${name}`);
    }
    assert.ok(
      SLOT_TABLE_ENGINE.critiqueFiles.includes(SLOT_TABLE_ENGINE.dateRangePickerField),
      'critiqueFiles must include DateRangePickerField',
    );
  });

  it('DataTable always mounts the filter funnel', () => {
    const src = read(SLOT_TABLE_ENGINE.dataTable);
    assert.match(src, SLOT_TABLE_ENGINE_CONTRACT.filterMenuAlwaysMounted);
    assert.match(src, SLOT_TABLE_ENGINE_CONTRACT.filterIdleChrome);
    assert.doesNotMatch(
      src,
      /\{filter \? <DataTableFilterMenu/,
      'filter icon must not be optional chrome',
    );
    const symbols = SLOT_TABLE_ENGINE.graphSymbols as readonly string[];
    assert.ok(symbols.includes('DataTableFilterMenu'), 'graphSymbols missing DataTableFilterMenu');
    assert.ok(
      SLOT_TABLE_ENGINE.critiqueFiles.includes(SLOT_TABLE_ENGINE.dataTable),
      'critiqueFiles must include DataTable',
    );
  });
});
