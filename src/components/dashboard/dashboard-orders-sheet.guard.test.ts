/**
 * To-ship Sheets flush chrome — pin DashboardOrdersView to Unbox recipe hosts.
 *
 * Tabs · KPI · triage live in `WORKBENCH_SHEET_CHROME` (no side gutters); body
 * is `WORKBENCH_SHEET_HOST`. Never reintroduce `WORKBENCH_CHROME_COLUMN` /
 * `WORKBENCH_BODY_COLUMN` / `WORKBENCH_GUTTERS` on that file.
 *
 * SoT: source-of-truth.md → Sheets flush mount recipe;
 * display/workbench-ops-queue.md → To-ship three-band flush chrome.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = join(process.cwd());
const ORDERS_VIEW = 'src/components/dashboard/DashboardOrdersView.tsx';
const ORDERS_GRID = 'src/components/dashboard/orders-queue/OrdersGridView.tsx';
const OUTBOUND_HEADER = 'src/components/dashboard/OutboundWorkspaceHeader.tsx';

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

  it('chrome stack is tabs · KPI · triage (search not on the tab row)', () => {
    const view = stripBlockComments(read(ORDERS_VIEW));
    assert.match(view, /OutboundTriageBand/);
    const header = stripBlockComments(read(OUTBOUND_HEADER));
    // Band 1 has no search/filters — those live on OutboundTriageBand.
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
      'Tab band must not host filters — OutboundTriageBand owns refine',
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

  it('tab band passes Unbox flush face overrides', () => {
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
    assert.match(headerBlock, /rounded-none/);
  });

  it('KPI band owns border-b seam; triage is border-r only against the sheet', () => {
    const src = read(ORDERS_VIEW);
    const kpiJsx = src.indexOf('<OutboundKpiStrip');
    assert.ok(kpiJsx >= 0);
    const before = src.slice(Math.max(0, kpiJsx - 200), kpiJsx);
    assert.match(
      before,
      /border-b border-r border-border-soft/,
      'KPI band must own border-b + border-r',
    );
    assert.match(src, /OutboundTriageBand/);
  });

  it('To-ship railSelection enables Sheets click-select (no checklist face)', () => {
    const src = stripBlockComments(read(ORDERS_GRID));
    assert.match(
      src,
      /const clickSelect = railSelection/,
      'railSelection must drive Sheets clickSelect on To-ship',
    );
    assert.match(src, /selectGutterChrome=\{clickSelect \? 'sheets' : 'always'\}/);
    assert.match(
      src,
      /onToggleSelect=\{clickSelect \? undefined : handleToggleSelect\}/,
      'clickSelect must strip the body checkbox toggle',
    );
  });

  it('triage hosts paint · List|Drill · compare · icon Priority (not Band 1)', () => {
    const header = stripBlockComments(read(OUTBOUND_HEADER));
    const headerFn = header.slice(header.indexOf('export function OutboundWorkspaceHeader'));
    const triageFnStart = headerFn.indexOf('export function OutboundTriageBand');
    const band1 = headerFn.slice(0, triageFnStart > 0 ? triageFnStart : undefined);
    const triage = headerFn.slice(triageFnStart > 0 ? triageFnStart : 0);

    assert.doesNotMatch(
      band1,
      /QueueSortSwitch/,
      'Priority sort must not live on Band 1 trailing — OutboundTriageBand owns icon sort',
    );
    assert.match(triage, /OrdersRowPaintChrome/);
    assert.match(triage, /OrdersDrillChrome/);
    assert.match(triage, /OrdersCompareChrome/);
    assert.match(
      triage,
      /QueueSortSwitch[\s\S]*variant=["']icon["']/,
      'Triage Priority must be the icon-only QueueSortSwitch variant',
    );

    // Composition order: paint → drill → compare → filters → icon-sort
    const paintIdx = triage.indexOf('OrdersRowPaintChrome');
    const drillIdx = triage.indexOf('OrdersDrillChrome');
    const compareIdx = triage.indexOf('OrdersCompareChrome');
    const sortIdx = triage.indexOf('QueueSortSwitch');
    assert.ok(paintIdx >= 0 && paintIdx < drillIdx && drillIdx < compareIdx && compareIdx < sortIdx);
  });

  it('body routes list | drill | compare hosts', () => {
    const src = stripBlockComments(read(ORDERS_VIEW));
    assert.match(src, /OrdersDrillHost/);
    assert.match(src, /OrdersCompareHost/);
    assert.match(src, /showCompare/);
    assert.match(src, /showDrill/);
  });
});
