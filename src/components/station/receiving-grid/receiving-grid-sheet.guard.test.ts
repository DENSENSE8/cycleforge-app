/**
 * Receiving golden Sheets recipe — pin flush surface + host SoT.
 *
 * `ReceivingGridView` mounts `LedgerGridSurface` with `surface="sheet"` so the
 * Unbox / History browse grid uses `TABLE_SURFACE_SHEET_CLASS` (no rounded-xl
 * island, no raised lift). Hosts wire `WORKBENCH_SHEET_HOST` — never raw `p-0`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { TABLE_SURFACE_SHEET_CLASS } from '@/design-system/tokens/table-surface';

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('Receiving grid Sheets recipe', () => {
  it('ReceivingGridView mounts LedgerGridSurface with surface="sheet"', () => {
    const src = read('src/components/station/receiving-grid/ReceivingGridView.tsx');
    assert.match(
      src,
      /<LedgerGridSurface[\s\S]*?surface="sheet"/,
      'ReceivingGridView must pass surface="sheet" — the golden Sheets mount',
    );
    assert.doesNotMatch(
      src,
      /TABLE_SURFACE_CLIP_CLASS/,
      'Receiving must not hand-compose the framed CLIP class — surface prop owns it',
    );
  });

  it('LedgerGridSurface sheet branch uses TABLE_SURFACE_SHEET_CLASS', () => {
    const src = read('src/design-system/components/grid/LedgerGridSurface.tsx');
    assert.match(src, /TABLE_SURFACE_SHEET_CLASS/);
    assert.match(
      src,
      /surface === 'sheet' \? TABLE_SURFACE_SHEET_CLASS : TABLE_SURFACE_CLIP_CLASS/,
    );
  });

  it('sheet token has no rounded-xl / raised lift', () => {
    assert.doesNotMatch(TABLE_SURFACE_SHEET_CLASS, /\brounded-xl\b/);
    assert.doesNotMatch(TABLE_SURFACE_SHEET_CLASS, /\bshadow-elev/);
  });

  it('Unbox / History hosts use WORKBENCH_SHEET_HOST (not BODY gutters around the grid)', () => {
    const unbox = read('src/components/receiving/unbox/UnboxWorkspaceView.tsx');
    assert.match(unbox, /WORKBENCH_SHEET_HOST/);
    assert.match(unbox, /WORKBENCH_SHEET_CHROME/);
    assert.doesNotMatch(
      unbox,
      /WORKBENCH_BODY_COLUMN/,
      'Unbox browse body must be the flush sheet host, not the padded framed body',
    );
    assert.doesNotMatch(
      unbox,
      /WORKBENCH_CHROME_COLUMN/,
      'Unbox chrome must use WORKBENCH_SHEET_CHROME — no side gutters beside the rail',
    );

    const table = read('src/components/station/ReceivingLinesTable.tsx');
    assert.match(table, /WORKBENCH_SHEET_HOST/);
    // Standalone History branch hosts the grid on the sheet host, not the
    // framed WorkbenchTablePane card island. Anchor on HistoryWorkspaceHeader
    // (not bare `if (isHistoryMode)` — that also gates URL weekOffset writes).
    const historyIdx = table.indexOf('<HistoryWorkspaceHeader');
    assert.ok(historyIdx >= 0, 'Standalone History branch must mount HistoryWorkspaceHeader');
    const historyBlock = table.slice(Math.max(0, historyIdx - 400), historyIdx + 900);
    assert.match(historyBlock, /WORKBENCH_SHEET_HOST/);
    assert.match(
      historyBlock,
      /WORKBENCH_SHEET_CHROME/,
      'Standalone History chrome must use the flush sheet chrome slot',
    );
    assert.doesNotMatch(historyBlock, /WorkbenchTablePane/);
    assert.doesNotMatch(
      table,
      /WORKBENCH_CHROME_COLUMN/,
      'ReceivingLinesTable must not reintroduce the framed gutter chrome',
    );
  });

  it('standalone HistoryWorkspaceHeader splits find onto Band 3 (no Band-1 search)', () => {
    const header = read('src/components/sidebar/receiving/HistoryWorkspaceHeader.tsx');
    // Band 3 composes the SoT triage band — no page-local twin.
    assert.match(header, /WorkbenchTriageBand/, 'History find must live on a Band-3 WorkbenchTriageBand');
    const chromeIdx = header.indexOf('<WorkbenchChromeHeader');
    const triageIdx = header.indexOf('<WorkbenchTriageBand');
    assert.ok(chromeIdx >= 0 && triageIdx > chromeIdx, 'Band 1 precedes Band 3');
    assert.doesNotMatch(
      header.slice(chromeIdx, triageIdx),
      /\bsearch=/,
      'Band 1 (WorkbenchChromeHeader) must not carry a search prop',
    );
  });

  it('Unbox triage composes the SoT WorkbenchTriageBand (border-r only, no local twin)', () => {
    // Unbox no longer forks a page-local triage band — it composes the SoT.
    const header = read('src/components/receiving/unbox/UnboxWorkspaceHeader.tsx');
    assert.match(header, /<WorkbenchTriageBand/, 'Unbox Band 3 must compose the SoT WorkbenchTriageBand');
    assert.doesNotMatch(header, /function UnboxTriageBand/, 'the page-local UnboxTriageBand twin is deleted');
    // The SoT wrapper owns the seam — border-r only (KPI owns the seam above; the
    // sheet owns border-t below). One hairline per joint.
    const shell = read('src/components/dashboard/workbench-shell.tsx');
    const bandStart = shell.indexOf('export function WorkbenchTriageBand');
    assert.ok(bandStart >= 0, 'WorkbenchTriageBand SoT must exist');
    const bandEnd = shell.indexOf('type TabSwitchTabs', bandStart);
    const bandBlock = shell.slice(bandStart, bandEnd > 0 ? bandEnd : bandStart + 1600);
    assert.doesNotMatch(bandBlock, /\bborder-y\b/);
    assert.doesNotMatch(bandBlock, /\bborder-b\b/);
    assert.doesNotMatch(bandBlock, /\bborder-t\b/);
    assert.match(bandBlock, /\bborder-r\b/);
  });

  it('Unbox Band 2 composes WorkbenchKpiBand (snap-collapse SoT)', () => {
    const header = read('src/components/receiving/unbox/UnboxWorkspaceHeader.tsx');
    assert.match(header, /WorkbenchKpiBand/);
    assert.match(header, /WorkbenchKpiCollapseToggle/);
    const cluster = read('src/components/receiving/unbox/UnboxChromeKpiCluster.tsx');
    assert.match(cluster, /UnboxKpiCanvas/);
    assert.doesNotMatch(cluster, /LedgerGrid/);
    const canvas = read('src/components/receiving/unbox/UnboxKpiCanvas.tsx');
    assert.match(canvas, /density="compact"/);
    assert.doesNotMatch(canvas, /KpiVizToggle/);
  });

  it('Unbox Band 1 clears border-t under GlobalHeader (no double hairline)', () => {
    const header = read('src/components/receiving/unbox/UnboxWorkspaceHeader.tsx');
    const chromeStart = header.indexOf('<WorkbenchChromeHeader');
    assert.ok(chromeStart >= 0, 'WorkbenchChromeHeader must exist');
    const chromeEnd = header.indexOf('/>', chromeStart);
    const chromeBlock = header.slice(
      chromeStart,
      chromeEnd > 0 ? chromeEnd + 2 : chromeStart + 400,
    );
    assert.match(
      chromeBlock,
      /border-t-0/,
      'Band 1 must use border-t-0 — GlobalHeader already owns the top seam',
    );
    const skeleton = read('src/components/receiving/unbox/UnboxWorkbenchSkeleton.tsx');
    assert.doesNotMatch(
      skeleton,
      /border-y/,
      'Skeleton Band 1 must not use border-y (would restack under GlobalHeader)',
    );
    assert.match(skeleton, /border-b border-r/);
  });

  it('LedgerGridColumnHeader is h-10 to match Unbox chrome bands', () => {
    const src = read('src/design-system/components/grid/LedgerGridColumnHeader.tsx');
    assert.doesNotMatch(src, /\bmin-h-11\b/);
    assert.match(src, /group\/hrow grid h-10 min-h-10/);
    // Select gutter stays h-10 when present; paint track also h-10.
    assert.match(src, /'h-10 min-h-10'/);
    assert.match(src, /emptyGutter \? 'items-stretch overflow-hidden p-0' : 'justify-center'/);
    assert.match(src, /group\/hcell relative gap-1 h-10 min-h-10/);
  });

  it('Receiving leaf rows are h-10 to match the column header band', () => {
    const row = read('src/components/station/receiving-grid/ReceivingGridRow.tsx');
    assert.match(
      row,
      /'h-10 min-h-10'/,
      'ReceivingGridRow must share the header band height (h-10)',
    );
    // Flat lines only — PO group summary folds were removed (Sheets golden).
    assert.doesNotMatch(
      read('src/components/station/receiving-grid/ReceivingGridGroupRow.tsx'),
      /ReceivingGridGroupSummary|CollapsibleGroupRow/,
      'ReceivingGridGroupRow must render flat leaves — no PO title summary fold',
    );
  });

  it('LedgerGrid scroll ports hard-stop (overscroll-*-none)', () => {
    const src = read('src/design-system/components/grid/LedgerGrid.tsx');
    assert.match(
      src,
      /overflow-y-auto/,
      'Self-scroll Y must be overflow-y-auto',
    );
    assert.match(
      src,
      /overscroll-y-none/,
      'Self-scroll Y must kill macOS rubber-band on sticky column header',
    );
    assert.match(
      src,
      /overflow-x-auto/,
      'Self-scroll scrollX must be overflow-x-auto',
    );
    assert.match(
      src,
      /overscroll-x-none/,
      'Self-scroll scrollX must kill macOS rubber-band on sticky select/header',
    );
    assert.match(
      src,
      /overflow-x-auto overflow-y-clip overscroll-x-none/,
      'Split-x body scroller must also hard-stop at the edges',
    );
    assert.match(
      src,
      /GridStickyXScrollbar/,
      'scrollX surfaces must mount the sticky bottom X triage gutter',
    );
  });

  it('Unbox Band 1 includes Urgent and All; All mounts TechAllTriageTable', () => {
    const state = read('src/utils/unbox-workspace-state.ts');
    assert.match(state, /urgent/);
    assert.match(state, /['"]all['"]/);
    assert.match(state, /priority_only/);
    const view = read('src/components/receiving/unbox/UnboxWorkspaceView.tsx');
    assert.match(view, /TechAllTriageTable/);
    assert.match(view, /scope=["']unbox["']/);
    const header = read('src/components/receiving/unbox/UnboxWorkspaceHeader.tsx');
    assert.match(header, /Urgent/);
    assert.match(header, /dividerBefore:\s*id === ['"]history['"]/);
  });

  it('Unbox History Band 3 is find + Refine funnel + park (View = layout only)', () => {
    const header = read('src/components/receiving/unbox/UnboxWorkspaceHeader.tsx');
    const panel = read('src/components/receiving/history/HistoryCartonTriagePanel.tsx');
    const viewCluster = read(
      'src/components/receiving/history/HistoryViewTopicsCluster.tsx',
    );
    const table = read('src/components/station/ReceivingLinesTable.tsx');
    // Dominant find — not the compact w-52 chrome twin on History.
    assert.match(
      header,
      /className="min-w-0 flex-1"/,
      'History TechRailSearchBar must be flex-1 (command-row wedge target)',
    );
    assert.match(
      header,
      /trailingSuffix=\{historyInFieldFilter\}/,
      'History Refine popover must nest in TechRailSearchBar trailingSuffix',
    );
    assert.match(header, /density="field"/);
    assert.match(header, /label="Refine"/);
    assert.match(header, /HISTORY_REFINE_FACETS/);
    assert.match(header, /HISTORY_REFINE_WEEK_OPTIONS/);
    assert.match(header, /HISTORY_REFINE_SOURCE_OPTIONS/);
    assert.match(header, /role="tablist"/);
    assert.match(header, /isHistoryRefineFacetHot/);
    assert.match(header, /contentClassName="w-72"/);
    const triageIdx = header.indexOf('<WorkbenchTriageBand');
    assert.ok(triageIdx >= 0);
    const triageBlock = header.slice(triageIdx, triageIdx + 1400);
    assert.doesNotMatch(
      triageBlock,
      /\bleading=\{/,
      'Search must be flush left — no leading utility over the select gutter',
    );
    // History omits Band 3 kpiToggle / refine right / controls portal.
    assert.match(
      triageBlock,
      /isHistoryTab \? undefined/,
      'History Band 3 must not host kpiToggle / refine / controls portal',
    );
    assert.match(
      triageBlock,
      /trailing=\{historyInspectorToggle\}/,
      'Inspector toggle must sit in WorkbenchTriageBand.trailing',
    );
    assert.match(header, /unbox-history-inspector-toggle/);
    assert.match(header, /setViewShellOpen/);
    assert.match(
      header,
      /Show inspector/,
      'History Band 3 reopen uses inspector nouns (not Station Open displays)',
    );
    assert.doesNotMatch(
      header,
      /Open displays/,
      'Open displays belongs on UnboxDisplaysEdgeToggle (LineEdit), not History Band 3',
    );
    // View cluster owns layout chrome only (no staff / week portal).
    assert.match(panel, /HistoryViewTopicsCluster/);
    assert.match(viewCluster, /WorkbenchKpiCollapseToggle/);
    assert.match(viewCluster, /HistoryDrillChrome/);
    assert.doesNotMatch(viewCluster, /StaffFilterButton/);
    // Unbox History must not portal the week pill into View controls.
    assert.match(
      table,
      /isHistoryMode && embedded/,
      'Embedded History must skip week DateRangePickerPill portal',
    );
    // Filter must not remain as a Band 3 toolbar sibling outside the field.
    const triageRightStart = header.indexOf('const triageRight');
    const triageRightEnd = header.indexOf('const historyInspectorToggle');
    assert.ok(triageRightStart >= 0 && triageRightEnd > triageRightStart);
    const triageRight = header.slice(triageRightStart, triageRightEnd);
    assert.doesNotMatch(
      triageRight,
      /Sort \/ search field|label="Refine"/,
      'History Refine funnel must not live in triageRight (in-field only)',
    );
  });
});
