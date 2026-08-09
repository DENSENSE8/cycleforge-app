/**
 * Receiving golden Sheets recipe — pin flush surface + host SoT.
 *
 * `ReceivingGridHost` mounts `NonlinearTableHost` with the receiving definition
 * (`surface: "sheet"`) so Unbox / History uses `TABLE_SURFACE_SHEET_CLASS` (no
 * rounded-xl island, no raised lift). Hosts wire `WORKBENCH_SHEET_HOST` — never
 * raw `p-0`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { TABLE_SURFACE_SHEET_CLASS } from '@/design-system/tokens/table-surface';
import { RECEIVING_BROWSE_DEFINITION } from '@/components/station/receiving-grid/receiving-table-definition';
import {
  UNBOX_WORKSPACE_TABS,
  getUnboxWorkspaceTabFromSearch,
  normalizeUnboxWorkspaceTabParams,
} from '@/utils/unbox-workspace-state';

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('Receiving grid Sheets recipe', () => {
  it('the receiving.browse DEFINITION declares surface: "sheet"', () => {
    // The shell recipe moved from a literal on the mount to the table definition
    // (plan Phase 1) — it is a property of `receiving.browse`, not of whichever
    // page happens to be showing it, which is why the host takes no override.
    assert.equal(RECEIVING_BROWSE_DEFINITION.surface, 'sheet');
  });

  it('ReceivingGridHost mounts the registry host, not the engine directly', () => {
    const src = read('src/components/station/receiving-grid/ReceivingGridHost.tsx');
    assert.match(
      src,
      /<NonlinearTableHost[\s\S]*?binding=\{RECEIVING_TABLE_BINDING\}/,
      'ReceivingGridHost must mount NonlinearTableHost with the receiving binding',
    );
    assert.doesNotMatch(
      src,
      /<LedgerGridSurface/,
      'The page binding must not reach past the host to the engine — geometry ' +
        'and shell come from the definition',
    );
    assert.doesNotMatch(
      src,
      /surface="(sheet|framed)"/,
      'The shell recipe belongs to the definition, never to the mount',
    );
    assert.doesNotMatch(
      src,
      /TABLE_SURFACE_CLIP_CLASS/,
      'Receiving must not hand-compose the framed CLIP class — the surface owns it',
    );
  });

  it('the host passes the definition surface through to the engine', () => {
    const src = read('src/components/tables/NonlinearTableHost.tsx');
    assert.match(
      src,
      /surface=\{definition\.surface\}/,
      'NonlinearTableHost must resolve the shell recipe from the definition',
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

  it('LedgerGridColumnHeader uses PRIMARY_CHROME_ROW_FACE to match Unbox chrome bands', () => {
    const src = read('src/design-system/components/grid/LedgerGridColumnHeader.tsx');
    assert.doesNotMatch(src, /\bmin-h-11\b/);
    assert.match(src, /PRIMARY_CHROME_ROW_FACE/);
    assert.match(src, /LEDGER_HEADER_ROW_FACE = PRIMARY_CHROME_ROW_FACE/);
    assert.match(src, /group\/hrow grid/);
    assert.match(src, /emptyGutter \? 'items-stretch overflow-hidden p-0' : 'justify-center'/);
    assert.match(src, /group\/hcell relative gap-1/);
    assert.match(src, /LEDGER_HEADER_ROW_FACE/);
  });

  it('Receiving leaf rows use PRIMARY_CHROME_ROW_FACE to match the column header band', () => {
    const row = read('src/components/station/receiving-grid/ReceivingGridRow.tsx');
    assert.match(
      row,
      /PRIMARY_CHROME_ROW_FACE/,
      'ReceivingGridRow must share the primary chrome row height',
    );
    assert.match(row, /PRIMARY_CHROME_ROW_FACE/);
    assert.doesNotMatch(row, /min-h-9/, 'row height is the primary atom — no min-h floor twin');
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

  it('Unbox Band 1 is Inbound · Queue · Recent · History — Urgent is not a tab, All is deep-link only', () => {
    // Asserted against the EXPORTED CONTRACT, never the source text. Until
    // 2026-08-08 this test read `assert.match(state, /urgent/)` on the file's
    // characters, and the module's docblock explains at length *why* Urgent was
    // removed — so the word appears repeatedly and the guard sailed through
    // green while claiming the exact opposite of what shipped. Same failure
    // mode as `return-to-scan.guard.test.ts:82`. A guard that greps prose
    // cannot fail when the prose is about the removal.
    assert.deepEqual(
      [...UNBOX_WORKSPACE_TABS],
      ['incoming', 'queue', 'recent', 'history'],
      'the strip is ordered by PROCESS — where a carton comes from, the work in ' +
        'front of you, what you have touched, the archive',
    );
    assert.equal(
      getUnboxWorkspaceTabFromSearch(new URLSearchParams()),
      'queue',
      'bare /unbox opens the Queue — a process-ordered strip must not default to its own last tab',
    );
    assert.equal(
      getUnboxWorkspaceTabFromSearch(new URLSearchParams('unboxview=urgent')),
      'queue',
      'urgency is a flag a carton carries at any stage, not a stage it sits in — ' +
        'a stale ?unboxview=urgent link migrates to the queue it was always a filter over',
    );
    // No tab owns `priority_only` any more, so a leftover from an old link must
    // be cleared rather than silently hiding every non-urgent carton behind
    // chrome that gives no hint the list is filtered.
    const stale = new URLSearchParams('unboxview=urgent&priority_only=1');
    normalizeUnboxWorkspaceTabParams(stale, 'queue');
    assert.equal(stale.get('priority_only'), null);

    // `all` survives in the vocabulary as a deep link but is NOT in the strip:
    // it mounts a different component, so it is a mode, not a filter of this table.
    assert.equal(UNBOX_WORKSPACE_TABS.includes('all'), false);
    const view = read('src/components/receiving/unbox/UnboxWorkspaceView.tsx');
    assert.match(view, /TechAllTriageTable/);
    assert.match(view, /scope=["']unbox["']/);
    const header = read('src/components/receiving/unbox/UnboxWorkspaceHeader.tsx');
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
    // Refine right / controls portal stay off Band 3; KPI toggle lives here.
    assert.doesNotMatch(
      triageBlock,
      /\bright=\{/,
      'History Band 3 must not host a refine right cluster',
    );
    assert.match(
      triageBlock,
      /WorkbenchKpiCollapseToggle/,
      'History Band 3 hosts KPI collapse (park-safe door)',
    );
    assert.match(
      triageBlock,
      /trailing=\{inspectorToggle\}/,
      'Inspector toggle must sit in WorkbenchTriageBand.trailing',
    );
    assert.match(header, /unbox-history-inspector-toggle/);
    assert.match(header, /WorkbenchInspectorToggle/);
    assert.match(header, /setViewShellOpen/);
    const inspectorToggle = read(
      'src/components/dashboard/workbench-inspector-toggle.tsx',
    );
    assert.match(
      inspectorToggle,
      /Show inspector/,
      'History Band 3 reopen uses inspector nouns (not Station Open displays)',
    );
    assert.match(inspectorToggle, /Hide inspector/);
    assert.doesNotMatch(
      header,
      /Open displays/,
      'Open displays belongs on StationDisplaysEdgeToggle (LineEdit), not History Band 3',
    );
    // View cluster owns layout chrome only (no staff / week / KPI portal).
    assert.match(panel, /HistoryViewTopicsCluster/);
    assert.doesNotMatch(viewCluster, /WorkbenchKpiCollapseToggle/);
    assert.match(viewCluster, /HistoryDrillChrome/);
    assert.doesNotMatch(viewCluster, /StaffFilterButton/);
    // Unbox History must not portal the week pill into View controls.
    assert.match(
      table,
      /isHistoryMode && embedded/,
      'Embedded History must skip week DateRangePickerPill portal',
    );
    // Filter must not remain as a Band 3 toolbar sibling outside the field —
    // History Refine lives only in TechRailSearchBar trailingSuffix.
    assert.doesNotMatch(
      header,
      /const triageRight/,
      'History must not keep a Band 3 triageRight refine cluster (in-field only)',
    );
    assert.match(header, /trailingSuffix=\{historyInFieldFilter\}/);
  });
});
