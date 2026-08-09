/**
 * Units Sheets recipe — pin flush surface + host SoT (Unbox / bins golden).
 *
 * Wave 0 of the SoT page-violation migrate: `/inventory` units is the first
 * inventory collection on the ops-queue golden. `inventory.units` declares
 * `surface: 'sheet'`; `UnitsWorkspaceView` mounts it through `NonlinearTableHost`;
 * and wires `WORKBENCH_SHEET_HOST` / `WORKBENCH_SHEET_CHROME`
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

  it('UnitsWorkspaceView mounts the registry host, not the engine directly', () => {
    const src = read('src/components/inventory/UnitsWorkspaceView.tsx');
    assert.match(
      src,
      /<NonlinearTableHost[\s\S]*?binding=\{UNITS_TABLE_BINDING\}/,
      'UnitsWorkspaceView must mount NonlinearTableHost with the units binding',
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
    assert.doesNotMatch(
      src,
      /UnitsGridView/,
      'The UnitsGridView wrapper is burned — the workspace binds the host directly',
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

  it('Wave 1: row-click opens the push inspector, never the legacy shell route', () => {
    const src = read('src/components/inventory/UnitsWorkspaceView.tsx');
    // The keystone: no record may route through the retired InventoryShell.
    assert.doesNotMatch(
      src,
      /\/inventory\?unit=/,
      'row-click must open the RightRailHost inspector, not push /inventory?unit= through the legacy shell',
    );
    assert.doesNotMatch(
      src,
      /useRouter/,
      'the units workspace no longer imperatively pushes a shell route',
    );
    assert.match(
      src,
      /InventoryInspectorRail/,
      'the units workspace mounts the push inspector',
    );
    assert.match(
      src,
      /useInventoryOpenParam/,
      'row-click writes ?open= via the optimistic mount-gated hook',
    );
  });

  it('Wave 1: the inspector is a non-modal RightRailHost push occupant (never the hero-title shell)', () => {
    const src = read('src/components/inventory/InventoryInspectorRail.tsx');
    assert.match(src, /DetailStackRailRegistrar/);
    assert.match(src, /modal=\{false\}/, 'record inspectors push; they do not float behind a scrim');
    assert.match(src, /DeskRailChromeRow/, 'chrome is the Desk single-card row, not InventoryDetailPanelShell');
  });

  it('units status resolves through the unit-status registry, never a local cell tone map', () => {
    const src = read('src/components/inventory/units-grid/cells/index.tsx');
    assert.match(src, /unitStatusBadgeClass/);
    assert.match(src, /unitStatusDotClass/);
    assert.match(src, /GridStatusCellValue/);
  });
});
