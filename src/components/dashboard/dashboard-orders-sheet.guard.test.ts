/**
 * To-ship Sheets flush chrome — pin DashboardOrdersView to Unbox History recipe.
 *
 * Tabs · KPI · find-only triage live in `WORKBENCH_SHEET_CHROME` (no side
 * gutters); body is `WORKBENCH_SHEET_HOST`. Sheet refine / layout / KPI hide
 * live on the pushing right inspector View cluster — never Band 3.
 *
 * SoT: source-of-truth.md → Sheets flush mount recipe;
 * display/workbench-ops-queue.md → To-ship find-only Band 3 / View topics.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = join(process.cwd());
const ORDERS_VIEW = 'src/components/dashboard/DashboardOrdersView.tsx';
const ORDERS_GRID = 'src/components/dashboard/orders-queue/OrdersGridView.tsx';
const ORDERS_PLANE = 'src/components/dashboard/orders-queue/useOrdersQueuePlane.ts';
const ORDERS_ROW = 'src/components/dashboard/orders-queue/OrdersQueueTableRow.tsx';
const OUTBOUND_HEADER = 'src/components/dashboard/OutboundWorkspaceHeader.tsx';
const VIEW_TOPICS = 'src/components/outbound/orders/OrdersViewTopicsCluster.tsx';
const VIEW_CHROME = 'src/components/outbound/orders/orders-view-chrome-context.tsx';
const VIEW_RAIL = 'src/components/outbound/orders/OrdersViewControlsRail.tsx';
const DESK = 'src/components/outbound/orders/OutboundOrdersDesk.tsx';
const ORDER_PANEL = 'src/components/shipped/ShippedDetailsPanel.tsx';
const PENDING_TABLE = 'src/components/unshipped/UnshippedShelfBoard.tsx';
const PACKED_TABLE = 'src/components/dashboard/PackedOrdersTable.tsx';

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

/** Strip block comments so doc prose cannot trip import/host bans. */
function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('To-ship Sheets flush chrome', () => {
  it('DashboardOrdersView uses WORKBENCH_SHEET_* hosts (not guttered columns)', () => {
    const src = stripBlockComments(read(ORDERS_VIEW));
    assert.match(src, /WORKBENCH_SHEET_CHROME/);
    assert.match(src, /WORKBENCH_SHEET_HOST/);
    assert.doesNotMatch(
      src,
      /WORKBENCH_CHROME_COLUMN/,
      'To-ship chrome must use WORKBENCH_SHEET_CHROME — no WORKBENCH_GUTTERS side pad',
    );
    assert.doesNotMatch(
      src,
      /WORKBENCH_BODY_COLUMN/,
      'To-ship body must be WORKBENCH_SHEET_HOST — not the padded framed body',
    );
    assert.doesNotMatch(
      src,
      /WORKBENCH_GUTTERS/,
      'Do not reintroduce WORKBENCH_GUTTERS on the To-ship desk',
    );
  });

  it('chrome stack is tabs · KPI · find-only triage (search not on the tab row)', () => {
    const view = stripBlockComments(read(ORDERS_VIEW));
    assert.match(view, /OutboundTriageBand/);
    const header = stripBlockComments(read(OUTBOUND_HEADER));
    // Band 1 has no search/filters — those live on OutboundTriageBand / View topics.
    const headerFn = header.slice(header.indexOf('export function OutboundWorkspaceHeader'));
    const triageFnStart = headerFn.indexOf('export function OutboundTriageBand');
    const band1 = headerFn.slice(0, triageFnStart > 0 ? triageFnStart : undefined);
    assert.doesNotMatch(
      band1,
      /TechRailSearchBar/,
      'Tab band must not host search — OutboundTriageBand owns find',
    );
    assert.doesNotMatch(
      band1,
      /OutboundExactFilters/,
      'Tab band must not host filters',
    );
    assert.match(header, /export function OutboundTriageBand/);
    assert.match(header, /WorkbenchTriageBand/);
  });

  it('KPI sits in pinned chrome stack (not a body mb-4 island)', () => {
    const src = stripBlockComments(read(ORDERS_VIEW));
    const kpiJsx = src.indexOf('<OutboundKpiStrip');
    assert.ok(kpiJsx >= 0, 'OutboundKpiStrip must remain mounted as JSX');
    const bodyUsage = src.indexOf('WORKBENCH_SHEET_HOST', src.indexOf('showOutboundChrome ?'));
    assert.ok(bodyUsage >= 0, 'WORKBENCH_SHEET_HOST must appear in the body className');
    assert.ok(
      kpiJsx < bodyUsage,
      'OutboundKpiStrip must sit inside the sheet chrome stack, above WORKBENCH_SHEET_HOST',
    );
    assert.doesNotMatch(
      src,
      /\bmb-4\b/,
      'Do not float KPI in an mb-4 body island — seat it in the chrome band',
    );
  });

  it('tab band seam ownership without soft-radius override', () => {
    const src = read(ORDERS_VIEW);
    const headerStart = src.indexOf('<OutboundWorkspaceHeader');
    assert.ok(headerStart >= 0, 'OutboundWorkspaceHeader must exist');
    const headerEnd = src.indexOf('/>', headerStart);
    const headerBlock = src.slice(
      headerStart,
      headerEnd > 0 ? headerEnd + 2 : headerStart + 500,
    );
    assert.match(
      headerBlock,
      /border-l-0/,
      'Tab band must clear left border — center/rail owns the hairline',
    );
    assert.match(
      headerBlock,
      /border-t-0/,
      'Band 1 must use border-t-0 — GlobalHeader already owns the top seam',
    );
    // Flush radius lives on WorkbenchChromeHeader SoT — no call-site rounded-none fight.
    assert.doesNotMatch(
      headerBlock,
      /rounded-none/,
      'Do not pass rounded-none on OutboundWorkspaceHeader — WorkbenchChromeHeader is flush at source',
    );
  });

  it('WorkbenchChromeHeader band SoT is flush (no soft card / pill rail)', () => {
    const shell = stripBlockComments(read('src/components/dashboard/workbench-shell.tsx'));
    const headerFn = shell.slice(shell.indexOf('export function WorkbenchChromeHeader'));
    const triageAt = headerFn.indexOf('export function WorkbenchTriageBand');
    const headerBody = headerFn.slice(0, triageAt > 0 ? triageAt : headerFn.length);
    assert.match(
      headerBody,
      /cornerClass\('flush'\)/,
      'WorkbenchChromeHeader outer face must use cornerClass(flush)',
    );
    assert.doesNotMatch(
      headerBody,
      /cornerClass\('card'\)/,
      'WorkbenchChromeHeader must not bake cornerClass(card) — flush at source',
    );
    assert.doesNotMatch(
      headerBody,
      /rounded-full/,
      'Default TabSwitch rail must not be a stadium pill',
    );
  });

  it('Packed idle CTA is flush DS Button (not soft rounded-lg raw link)', () => {
    const packed = stripBlockComments(read(PACKED_TABLE));
    assert.match(packed, /from '@\/design-system\/primitives'/);
    assert.match(packed, /<Button[\s\S]*Open Scan-out/);
    assert.doesNotMatch(
      packed,
      /rounded-lg/,
      'Packed idle CTA must not use rounded-lg',
    );
    assert.doesNotMatch(
      packed,
      /ds-raw-button/,
      'Packed idle CTA must use DS Button, not ds-raw-button',
    );
  });

  it('Band 3 is flex-1 find + inspector park only (Unbox History golden)', () => {
    const header = stripBlockComments(read(OUTBOUND_HEADER));
    const triageFnStart = header.indexOf('export function OutboundTriageBand');
    const triage = header.slice(triageFnStart > 0 ? triageFnStart : 0);

    assert.match(
      triage,
      /className=["']min-w-0 flex-1["']/,
      'To-ship find must fill remaining Band 3 width (min-w-0 flex-1)',
    );
    assert.doesNotMatch(
      triage,
      /w-56 shrink-0/,
      'Do not pin To-ship search to a fixed width',
    );
    assert.match(triage, /WorkbenchInspectorToggle/);
    assert.match(triage, /orders-inspector-toggle/);
    assert.match(triage, /trailing=\{inspectorToggle\}/);
    const inspectorToggle = stripBlockComments(
      read('src/components/dashboard/workbench-inspector-toggle.tsx'),
    );
    assert.match(inspectorToggle, /Show inspector/);
    assert.match(inspectorToggle, /Hide inspector/);

    // Refine / layout chrome must NOT live on Band 3.
    assert.doesNotMatch(triage, /OrdersRowPaintChrome/);
    assert.doesNotMatch(triage, /OrdersDrillChrome/);
    assert.doesNotMatch(triage, /OrdersCompareChrome/);
    assert.doesNotMatch(triage, /OutboundExactFilters/);
    assert.doesNotMatch(triage, /QueueSortSwitch/);
    assert.doesNotMatch(triage, /WorkbenchKpiCollapseToggle/);
    assert.doesNotMatch(triage, /kpiToggle=/);
    assert.doesNotMatch(triage, /controlsSlotRef/);
    assert.doesNotMatch(triage, /\bright=\{/);
  });

  it('View chrome bridge + topics cluster own sheet refine / portal / KPI', () => {
    const chrome = stripBlockComments(read(VIEW_CHROME));
    assert.match(chrome, /OrdersViewChromeProvider/);
    assert.match(chrome, /OrdersViewChromeBridge/);
    assert.match(chrome, /controlsEl/);
    assert.match(chrome, /viewShellOpen/);
    assert.match(chrome, /WORKBENCH_KPI_SURFACE\.outbound/);

    const desk = stripBlockComments(read(DESK));
    assert.match(desk, /OrdersViewChromeProvider/);

    const topics = stripBlockComments(read(VIEW_TOPICS));
    assert.match(topics, /OrdersRowPaintChrome/);
    assert.match(topics, /OrdersDrillChrome/);
    assert.match(topics, /OrdersCompareChrome/);
    assert.match(topics, /OutboundExactFilters/);
    assert.match(topics, /QueueSortSwitch[\s\S]*variant=["']icon["']/);
    assert.match(topics, /StaffFilterButton[\s\S]*iconOnly/);
    assert.match(topics, /WorkbenchKpiCollapseToggle/);
    assert.match(topics, /setControlsEl/);
    assert.match(topics, /data-orders-view-topics/);

    // Compose order in the JSX return (imports also mention these names).
    const returnIdx = topics.indexOf('return (');
    const body = returnIdx >= 0 ? topics.slice(returnIdx) : topics;
    const paintIdx = body.indexOf('<OrdersRowPaintChrome');
    const drillIdx = body.indexOf('<OrdersDrillChrome');
    const compareIdx = body.indexOf('<OrdersCompareChrome');
    const sortIdx = body.indexOf('<QueueSortSwitch');
    assert.ok(
      paintIdx >= 0 && paintIdx < drillIdx && drillIdx < compareIdx && compareIdx < sortIdx,
      'View topics order: paint → drill → compare → … → icon-sort',
    );

    const view = stripBlockComments(read(ORDERS_VIEW));
    assert.match(view, /useOrdersViewChrome/);
    assert.match(view, /toolbarPortalTarget=\{controlsEl\}/);
    assert.match(view, /columnTriggerPortalTarget=\{controlsEl\}/);
    assert.match(view, /OrdersViewControlsRail/);
    assert.doesNotMatch(
      view,
      /useWorkbenchKpiCollapsed/,
      'KPI collapse state lives on OrdersViewChromeProvider — not a page-local twin',
    );

    for (const table of [PENDING_TABLE, PACKED_TABLE]) {
      const tableSource = stripBlockComments(read(table));
      assert.doesNotMatch(
        tableSource,
        /StaffFilterButton|createPortal/,
        `${table}: staff must compose directly in View topics, not portal from the grid`,
      );
    }
  });

  it('KPI band reads shared chrome; toggle lives on View topics (not Band 3)', () => {
    const src = stripBlockComments(read(ORDERS_VIEW));
    const bandJsx = src.indexOf('<WorkbenchKpiBand');
    assert.ok(bandJsx >= 0, 'KPI must be wrapped in WorkbenchKpiBand (snap-collapse)');
    const kpiJsx = src.indexOf('<OutboundKpiStrip', bandJsx);
    assert.ok(kpiJsx >= 0, 'OutboundKpiStrip must sit inside WorkbenchKpiBand');
    assert.match(src, /open=\{kpiOpen\}/);

    const topics = stripBlockComments(read(VIEW_TOPICS));
    assert.match(topics, /WorkbenchKpiCollapseToggle/);
  });

  it('selected-order inspector is order-only; View topics live on detail:orders-view', () => {
    const panel = stripBlockComments(read(ORDER_PANEL));
    assert.doesNotMatch(
      panel,
      /OrdersViewTopicsCluster/,
      'detail:order must not mount sheet View topics — those live on detail:orders-view',
    );
    assert.doesNotMatch(panel, /viewTopics=/);
    assert.match(panel, /orderInspectorDisplayTopics|order-inspector-topics/);
    assert.match(panel, /edgeCollapse/);
    assert.match(panel, /collapsedStrip=\{false\}/);
    assert.match(panel, /data-order-inspector/);

    const viewOnly = stripBlockComments(read(VIEW_RAIL));
    assert.match(viewOnly, /detail:orders-view/);
    assert.match(viewOnly, /OrdersViewTopicsCluster/);
    assert.match(viewOnly, /hidePaint/);
    assert.match(viewOnly, /edgeCollapse/);
    assert.match(viewOnly, /collapsedStrip=\{false\}/);

    const compare = stripBlockComments(read('src/components/dashboard/rail/OrderRailCompare.tsx'));
    assert.match(compare, /OrdersViewTopicsCluster/);
    assert.match(compare, /edgeCollapse/);

    const batch = stripBlockComments(read('src/components/dashboard/rail/OrderRailShell.tsx'));
    assert.match(batch, /OrdersViewTopicsCluster/);
    assert.match(batch, /edgeCollapse/);
  });

  it('To-ship railSelection keeps click-select gestures + always-painted checkboxes', () => {
    const src = stripBlockComments(read(ORDERS_GRID));
    // clickSelect = railSelection now lives in the selection plane hook (wave 5c),
    // where the row-action gestures it gates also live.
    assert.match(
      stripBlockComments(read(ORDERS_PLANE)),
      /const clickSelect = railSelection/,
      'railSelection must drive Sheets clickSelect on To-ship (in useOrdersQueuePlane)',
    );
    assert.match(
      src,
      /selectGutterChrome=["']always["']/,
      'To-ship must paint the always checklist gutter (not empty sheets chrome)',
    );
    assert.doesNotMatch(
      src,
      /selectGutterChrome=\{clickSelect \? 'sheets' : 'always'\}/,
      'clickSelect must not map to empty sheets gutter chrome',
    );
    assert.match(
      src,
      /onToggleSelect=\{handleToggleSelect\}/,
      'body rows must mount an interactive GridRowCheckbox toggle',
    );
  });

  it('To-ship Cond column uses Unbox flush grade face via condition SoT', () => {
    const row = stripBlockComments(read(ORDERS_ROW));
    assert.match(row, /data-col="condition"/);
    assert.match(row, /conditionGradeTextClass/);
    assert.match(row, /conditionGradeTableLabel/);
    assert.match(row, /GridRowCheckbox/);
    assert.doesNotMatch(row, /conditionGradeStatusChip/);
    assert.doesNotMatch(
      row,
      /clickSelect \? \(\s*<div[\s\S]*data-select-gutter[\s\S]*aria-hidden/,
      'clickSelect must not mount an empty select spacer',
    );
  });

  it('body routes list | drill | compare hosts', () => {
    const src = stripBlockComments(read(ORDERS_VIEW));
    assert.match(src, /OrdersDrillHost/);
    assert.match(src, /OrdersCompareHost/);
    assert.match(src, /showCompare/);
    assert.match(src, /showDrill/);
  });

  it('sheet QueueGroupRow is flat leaves — order rollups only on drill parent map', () => {
    const group = read('src/components/dashboard/orders-queue/QueueGroupRow.tsx');
    assert.doesNotMatch(
      group,
      /CollapsibleGroupRow|OrderGroupSummary/,
      'QueueGroupRow must render flat leaves — no in-grid order summary fold',
    );
    const drill = read('src/components/outbound/orders/OrdersDrillHost.tsx');
    assert.match(
      drill,
      /LedgerDrillParentMap/,
      'Orders drill must host the parent map where multi-line rollups live',
    );
  });
});
