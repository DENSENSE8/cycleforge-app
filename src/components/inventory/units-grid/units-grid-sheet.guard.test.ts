/**
 * Units Sheets recipe — pin flush surface + host SoT (Unbox / bins golden).
 *
 * Wave 0 of the SoT page-violation migrate: `/inventory` units is the first
 * inventory collection on the ops-queue golden. `inventory.units` declares
 * `surface: 'sheet'`; `UnitsGridView` mounts it through `NonlinearTableHost`;
 * `UnitsWorkspaceView` wires `WORKBENCH_SHEET_HOST` / `WORKBENCH_SHEET_CHROME`
 * (never a `PageHeader` + `max-w-5xl` island); the `/inventory/units` route
 * mounts the workspace, not the legacy `InventoryShell`.
 *
 * Phase A is deliberately narrow (grid core + minimal Band 1). It does NOT yet
 * assert Band 2 KPI / Band 3 find + Show-inspector / left saved-views — those
 * land in Phase B once the shared shell files are clean to swap. This guard is
 * shrink-only: Phase B GROWS it (adds those positive assertions), never relaxes
 * the surface pins below.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { UNITS_TABLE_DEFINITION } from '@/components/inventory/units-grid/units-table-definition';

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('Units grid Sheets recipe (Unbox / bins golden)', () => {
  it('the inventory.units DEFINITION declares surface: "sheet"', () => {
    assert.equal(UNITS_TABLE_DEFINITION.surface, 'sheet');
    assert.equal(UNITS_TABLE_DEFINITION.id, 'inventory.units');
    assert.equal(UNITS_TABLE_DEFINITION.tableId, 'inventory-units');
  });

  it('UnitsGridView mounts the registry host, not the engine directly', () => {
    const src = read('src/components/inventory/units-grid/UnitsGridView.tsx');
    assert.match(
      src,
      /<NonlinearTableHost[\s\S]*?binding=\{UNITS_TABLE_BINDING\}/,
      'UnitsGridView must mount NonlinearTableHost with the units binding',
    );
    assert.doesNotMatch(
      src,
      /<LedgerGridSurface/,
      'The page binding must not reach past the host to the engine',
    );
    assert.doesNotMatch(
      src,
      /surface="(sheet|framed)"/,
      'The shell recipe belongs to the definition, never to the mount',
    );
  });

  it('UnitsWorkspaceView uses WORKBENCH_SHEET_HOST / WORKBENCH_SHEET_CHROME (no max-w-5xl island)', () => {
    const src = read('src/components/inventory/UnitsWorkspaceView.tsx');
    assert.match(src, /WORKBENCH_SHEET_HOST/);
    assert.match(src, /WORKBENCH_SHEET_CHROME/);
    assert.doesNotMatch(
      src,
      /max-w-5xl/,
      'The units workspace must not reintroduce the InventoryShell max-width island',
    );
    assert.doesNotMatch(
      src,
      /PageHeader/,
      'The units workspace must not reintroduce the PageHeader chrome',
    );
  });

  it('the /inventory/units route mounts UnitsWorkspaceView (not the legacy InventoryShell)', () => {
    const src = read('src/app/inventory/units/page.tsx');
    assert.match(src, /UnitsWorkspaceView/);
    assert.doesNotMatch(
      src,
      /InventoryShell/,
      'The units route is migrated — it must not fall back to the shared legacy shell',
    );
  });

  it('units status resolves through the unit-status registry, never a local cell tone map', () => {
    const src = read('src/components/inventory/units-grid/cells/index.tsx');
    assert.match(src, /unitStatusBadgeClass/);
    assert.match(src, /unitStatusDotClass/);
    assert.match(src, /GridStatusCellValue/);
  });
});
