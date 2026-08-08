/**
 * Sheets-flush cohort — Wave 7 (long tail).
 *
 * Grid surfaces (Pickup · Repair · Catalog · FBA) carry the flush Sheets stack:
 * `WORKBENCH_SHEET_CHROME` chrome, `WORKBENCH_SHEET_HOST` body, find on a
 * `WorkbenchTriageBand`. Tool / media / feed surfaces (Photos · Labels products ·
 * Walk-In hub + feed) are not ops-queue grids, so they only shed the gutter
 * markers and mount flush.
 *
 * No surface here may reintroduce `WORKBENCH_CHROME_COLUMN` /
 * `WORKBENCH_BODY_COLUMN` / `WORKBENCH_GUTTERS` / `WorkbenchTablePane`.
 *
 * SoT: source-of-truth.md → Sheets flush mount recipe;
 * display/workbench-ops-queue.md → Unbox / To-ship three-band flush chrome.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import type { TableDefinition } from '@/lib/tables/table-definition';
import { PICKUP_TABLE_DEFINITION } from '@/components/receiving/pickup/grid/pickup-table-definition';
import { WARRANTY_TABLE_DEFINITION } from '@/components/warranty/grid/warranty-table-definition';
import { UNFOUND_TABLE_DEFINITION } from '@/components/receiving/unfound/grid/unfound-table-definition';
import { TRACKING_EXCEPTIONS_TABLE_DEFINITION } from '@/components/tracking-exceptions/grid/tracking-exceptions-table-definition';
import { CATALOG_TABLE_DEFINITION } from '@/components/products/catalog/catalog-grid/catalog-table-definition';
import { REPAIR_TABLE_DEFINITION } from '@/components/repair/repair-grid/repair-table-definition';

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * The sheet recipe, asserted two ways because this cohort straddles the
 * registry migration (plan Phase 1). A MIGRATED surface mounts
 * `NonlinearTableHost` and its shell recipe lives on the definition, so assert
 * `definition.surface === 'sheet'` + the host mount. An un-migrated surface
 * still mounts `LedgerGridSurface` directly, so grep the literal. Either way the
 * grid cannot fall back to the framed CLIP default.
 */
function assertSheetRecipe(label: string, gridView: string, definition?: TableDefinition) {
  const src = read(gridView);
  if (definition) {
    assert.equal(definition.surface, 'sheet', `${label} definition must declare surface: 'sheet'`);
    assert.match(
      src,
      /<NonlinearTableHost[\s\S]*?binding=\{/,
      `${label} GridView must mount NonlinearTableHost with its binding`,
    );
    assert.doesNotMatch(
      src,
      /<LedgerGridSurface/,
      `${label} GridView must not reach past the host to the engine`,
    );
  } else {
    assert.match(
      src,
      /<LedgerGridSurface[\s\S]*?surface="sheet"/,
      `${label} GridView must pin surface="sheet" — never the framed CLIP default`,
    );
  }
}

/** No surface may carry the retired gutter / framed-island markers. */
function assertNoGutters(src: string) {
  assert.doesNotMatch(src, /WORKBENCH_CHROME_COLUMN/);
  assert.doesNotMatch(src, /WORKBENCH_BODY_COLUMN/);
  assert.doesNotMatch(src, /WORKBENCH_GUTTERS/);
  assert.doesNotMatch(src, /WorkbenchTablePane/);
}

// Grid surfaces — full flush Sheets stack. `triageFiles` are where the
// WorkbenchTriageBand actually mounts (view or its split header). `gridView`
// is the inner adapter that must pin `surface="sheet"` (never the framed CLIP
// default). FBA's Ledger grid is ReadyQueueTable — guarded in
// ready-workspace-sheet.guard.test.ts (its board/shipped tables are non-Ledger).
const GRID_SURFACES: {
  label: string;
  view: string;
  triageFiles: string[];
  gridView?: string;
  /** Set once the surface is on the registry host (plan Phase 1). */
  definition?: TableDefinition;
}[] = [
  {
    label: 'Pickup',
    view: 'src/components/receiving/pickup/PickupWorkspace.tsx',
    triageFiles: ['src/components/receiving/pickup/PickupWorkspace.tsx'],
    gridView: 'src/components/receiving/pickup/PickupWorkspace.tsx',
    definition: PICKUP_TABLE_DEFINITION,
  },
  {
    label: 'Repair',
    view: 'src/components/repair/RepairTable.tsx',
    triageFiles: ['src/components/repair/RepairWorkspaceHeader.tsx'],
    gridView: 'src/components/repair/repair-grid/RepairGridView.tsx',
    definition: REPAIR_TABLE_DEFINITION,
  },
  {
    label: 'Catalog',
    view: 'src/components/products/catalog/ProductsCatalogWorkspace.tsx',
    triageFiles: ['src/components/products/catalog/ProductsCatalogWorkspace.tsx'],
    // The catalog grid mount now lives in the workspace (no wrapper file).
    gridView: 'src/components/products/catalog/ProductsCatalogWorkspace.tsx',
    definition: CATALOG_TABLE_DEFINITION,
  },
  {
    label: 'FBA',
    view: 'src/components/fba/FbaOutboundWorkspace.tsx',
    triageFiles: ['src/components/fba/FbaWorkspaceHeader.tsx'],
  },
];

// Grid-pinned residual surfaces — the GRID is a flush sheet even where the page
// chrome is not yet a full three-band stack (bare padded host / bespoke
// FilterBar). Pins `surface="sheet"` so the grid can never fall back to the
// framed CLIP default. Full chrome migration of these hosts is a follow-up.
const RESIDUAL_GRID_PINS: { label: string; gridView: string; definition?: TableDefinition }[] = [
  {
    label: 'Warranty',
    // Grid mount now lives in the claims table (no wrapper file).
    gridView: 'src/components/warranty/WarrantyClaimsTable.tsx',
    definition: WARRANTY_TABLE_DEFINITION,
  },
  {
    label: 'Unfound',
    gridView: 'src/components/receiving/unfound/UnfoundQueueTable.tsx',
    definition: UNFOUND_TABLE_DEFINITION,
  },
  {
    label: 'Tracking exceptions',
    gridView: 'src/components/tracking-exceptions/TrackingExceptionsTable.tsx',
    definition: TRACKING_EXCEPTIONS_TABLE_DEFINITION,
  },
];

// Tool / media / feed surfaces — flush only (no forced grid stack).
const FLUSH_SURFACES: { label: string; file: string }[] = [
  { label: 'Photos', file: 'src/components/photos/PhotoLibraryPage.tsx' },
  { label: 'Labels products', file: 'src/components/labels/LabelsProductsWorkspace.tsx' },
  { label: 'Walk-In hub', file: 'src/components/walk-in/WalkInHistoryHub.tsx' },
  { label: 'Walk-In feed', file: 'src/components/walk-in/WalkInFeedPane.tsx' },
];

describe('Sheets-flush cohort — Wave 7 grid surfaces', () => {
  for (const s of GRID_SURFACES) {
    describe(s.label, () => {
      it('uses WORKBENCH_SHEET_* hosts (no gutters / framed islands)', () => {
        const src = stripBlockComments(read(s.view));
        assert.match(src, /WORKBENCH_SHEET_CHROME/);
        assert.match(src, /WORKBENCH_SHEET_HOST/);
        assertNoGutters(src);
      });

      it('find lives on a WorkbenchTriageBand (Band 3)', () => {
        const found = s.triageFiles.some((f) =>
          /WorkbenchTriageBand/.test(stripBlockComments(read(f))),
        );
        assert.ok(found, `${s.label} must mount find on a WorkbenchTriageBand`);
      });

      it('tab band passes Unbox flush face overrides', () => {
        const src = read(s.view);
        assert.match(src, /border-l-0/);
        assert.match(src, /border-t-0/);
        assert.match(src, /rounded-none/);
      });

      if (s.gridView) {
        it('inner GridView carries the flush sheet recipe', () => {
          assertSheetRecipe(s.label, s.gridView!, s.definition);
        });
      }
    });
  }
});

describe('Sheets-flush cohort — residual GridView surface pins', () => {
  for (const s of RESIDUAL_GRID_PINS) {
    it(`${s.label} GridView carries the flush sheet recipe`, () => {
      assertSheetRecipe(s.label, s.gridView, s.definition);
    });
  }

  it('Labels queue does not wrap the sheet in a framed WORKBENCH_TABLE_VIEWPORT', () => {
    const src = stripBlockComments(read('src/components/outbound/labels/LabelsQueueTable.tsx'));
    assert.doesNotMatch(src, /WORKBENCH_TABLE_VIEWPORT/);
    assertNoGutters(src);
  });
});

describe('Sheets-flush cohort — Wave 7 tool / feed surfaces', () => {
  for (const s of FLUSH_SURFACES) {
    describe(s.label, () => {
      it('mounts flush — no gutter columns / framed island', () => {
        const src = stripBlockComments(read(s.file));
        assertNoGutters(src);
        assert.match(
          src,
          /WORKBENCH_SHEET_(CHROME|HOST)/,
          `${s.label} must mount on a flush sheet host`,
        );
      });
    });
  }
});
