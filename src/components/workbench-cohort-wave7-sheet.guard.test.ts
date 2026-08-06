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

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
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
// default). FBA's Ledger grid is ReadyGridView — guarded in
// ready-workspace-sheet.guard.test.ts (its board/shipped tables are non-Ledger).
const GRID_SURFACES: {
  label: string;
  view: string;
  triageFiles: string[];
  gridView?: string;
}[] = [
  {
    label: 'Pickup',
    view: 'src/components/receiving/pickup/PickupWorkspace.tsx',
    triageFiles: ['src/components/receiving/pickup/PickupWorkspace.tsx'],
    gridView: 'src/components/receiving/pickup/grid/PickupGridView.tsx',
  },
  {
    label: 'Repair',
    view: 'src/components/repair/RepairTable.tsx',
    triageFiles: ['src/components/repair/RepairWorkspaceHeader.tsx'],
    gridView: 'src/components/repair/repair-grid/RepairGridView.tsx',
  },
  {
    label: 'Catalog',
    view: 'src/components/products/catalog/ProductsCatalogWorkspace.tsx',
    triageFiles: ['src/components/products/catalog/ProductsCatalogWorkspace.tsx'],
    gridView: 'src/components/products/catalog/catalog-grid/CatalogGridView.tsx',
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
const RESIDUAL_GRID_PINS: { label: string; gridView: string }[] = [
  { label: 'Warranty', gridView: 'src/components/warranty/grid/WarrantyGridView.tsx' },
  { label: 'Unfound', gridView: 'src/components/receiving/unfound/grid/UnfoundGridView.tsx' },
  {
    label: 'Tracking exceptions',
    gridView: 'src/components/tracking-exceptions/grid/TrackingExceptionsGridView.tsx',
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
        it('inner GridView pins surface="sheet" (never the framed CLIP default)', () => {
          assert.match(
            read(s.gridView!),
            /<LedgerGridSurface[\s\S]*?surface="sheet"/,
            `${s.label} GridView must pin surface="sheet"`,
          );
        });
      }
    });
  }
});

describe('Sheets-flush cohort — residual GridView surface pins', () => {
  for (const s of RESIDUAL_GRID_PINS) {
    it(`${s.label} GridView pins surface="sheet"`, () => {
      assert.match(
        read(s.gridView),
        /<LedgerGridSurface[\s\S]*?surface="sheet"/,
        `${s.label} GridView must pin surface="sheet" — never the framed CLIP default`,
      );
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
