/**
 * Shipping Sheets flush chrome — pin ShippingWorkspaceView to Unbox recipe hosts.
 *
 * Tabs · KPI · triage live in `WORKBENCH_SHEET_CHROME` (no side gutters); body
 * is `WORKBENCH_SHEET_HOST`. Never reintroduce `WORKBENCH_CHROME_COLUMN` /
 * `WORKBENCH_BODY_COLUMN` / `WORKBENCH_GUTTERS` / framed `WORKBENCH_TABLE_VIEWPORT`.
 *
 * SoT: source-of-truth.md → Sheets flush mount recipe;
 * display/workbench-ops-queue.md → Unbox / To-ship three-band flush chrome.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = join(process.cwd());
const VIEW = 'src/components/tech/shipping/ShippingWorkspaceView.tsx';
const HEADER = 'src/components/tech/shipping/ShippingWorkspaceHeader.tsx';

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

/** Strip block comments so doc prose cannot trip import/host bans. */
function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('Shipping Sheets flush chrome', () => {
  it('ShippingWorkspaceView composes the Sheets shell (not guttered columns)', () => {
    const src = stripBlockComments(read(VIEW));
    // The recipe moved into WorkbenchSheetView (2d) — the page composes it and
    // no longer holds the tokens, so it cannot drift from the other four sheets.
    // Token ownership is asserted once in `workbench-sheet-view.guard.test.ts`.
    assert.match(src, /<WorkbenchSheetView/);
    assert.match(src, /useWorkbenchSheetChrome/);
    assert.doesNotMatch(
      src,
      /WORKBENCH_CHROME_COLUMN/,
      'Shipping chrome must use WORKBENCH_SHEET_CHROME — no WORKBENCH_GUTTERS side pad',
    );
    assert.doesNotMatch(
      src,
      /WORKBENCH_BODY_COLUMN/,
      'Shipping body must be WORKBENCH_SHEET_HOST — not the padded framed body',
    );
    assert.doesNotMatch(
      src,
      /WORKBENCH_GUTTERS/,
      'Do not reintroduce WORKBENCH_GUTTERS on the Shipping desk',
    );
    assert.doesNotMatch(
      src,
      /WORKBENCH_TABLE_VIEWPORT/,
      'Shipping History must not reintroduce the framed WORKBENCH_TABLE_VIEWPORT island',
    );
  });

  it('chrome stack is tabs · KPI · triage (search not on the tab row)', () => {
    const view = stripBlockComments(read(VIEW));
    assert.match(view, /triage=\{/, 'Band 3 rides the shell triage slot');
    assert.match(view, /ShippingTriageBand/);
    assert.match(view, /kpi=\{/, 'Band 2 rides the shell kpi slot');
    const header = stripBlockComments(read(HEADER));
    const headerFn = header.slice(header.indexOf('export function ShippingWorkspaceHeader'));
    const triageFnStart = headerFn.indexOf('export function ShippingTriageBand');
    const band1 = headerFn.slice(0, triageFnStart > 0 ? triageFnStart : undefined);
    assert.doesNotMatch(
      band1,
      /TechRailSearchBar/,
      'Tab band must not host search — ShippingTriageBand owns find',
    );
    assert.doesNotMatch(
      band1,
      /OutboundExactFilters/,
      'Tab band must not host filters — ShippingTriageBand owns refine',
    );
    assert.match(header, /export function ShippingTriageBand/);
    assert.match(header, /WorkbenchTriageBand/);
    assert.match(header, /WorkbenchKpiCollapseToggle/);
  });

  it('KPI sits in the pinned chrome stack (not a body mb-4 island)', () => {
    const src = stripBlockComments(read(VIEW));
    const kpiJsx = src.indexOf('<ShippingKpiStrip');
    assert.ok(kpiJsx >= 0, 'ShippingKpiStrip must remain mounted as JSX');
    // The shell renders `kpi` inside the chrome stack and `children` in the sheet
    // host, so KPI preceding the body render-prop IS "above the sheet".
    const bodyStart = src.indexOf('{({ controlsEl })');
    assert.ok(bodyStart >= 0, 'body must be the shell children render-prop');
    assert.ok(kpiJsx < bodyStart, 'ShippingKpiStrip must ride the kpi slot, above the body');
    assert.doesNotMatch(
      src,
      /\bmb-4\b/,
      'Do not float KPI in an mb-4 body island — seat it in the chrome band',
    );
  });

  it('the tab band takes its flush face from the shell', () => {
    const src = read(VIEW);
    const headerStart = src.indexOf('<ShippingWorkspaceHeader');
    assert.ok(headerStart >= 0, 'ShippingWorkspaceHeader must exist');
    const headerEnd = src.indexOf('/>', headerStart);
    const headerBlock = src.slice(headerStart, headerEnd > 0 ? headerEnd + 2 : headerStart + 500);
    // The flush face (`rounded-none border-l-0 border-t-0 shadow-sm`) is the
    // shell's `WORKBENCH_SHEET_TABS_CLASS`, handed to the tabs slot. Re-typing it
    // here is how five pages drifted; the page just forwards it.
    assert.match(
      headerBlock,
      /className=\{className\}/,
      'Band 1 must forward the shell-supplied flush face',
    );
    assert.match(src, /tabs=\{\(\{ className \}\)/, 'tabs slot must receive the face class');
  });

  it('Band 1 keeps New Order trailing; Band 2 rides the shell KPI slot', () => {
    const src = stripBlockComments(read(VIEW));
    assert.match(src, /kpi=\{/);
    assert.match(src, /ShippingTriageBand/);
    const header = stripBlockComments(read(HEADER));
    const headerFn = header.slice(header.indexOf('export function ShippingWorkspaceHeader'));
    const triageFnStart = headerFn.indexOf('export function ShippingTriageBand');
    const band1 = headerFn.slice(0, triageFnStart > 0 ? triageFnStart : undefined);
    assert.match(band1, /WorkbenchTrailingCluster/);
    assert.match(band1, /OutboundOrderChromeActions/);
  });

  it('Band 1 includes Urgent and All; All mounts TechAllTriageTable', () => {
    // Labels live in the workspace-state SoT — header maps via TAB_LABEL[id].
    const labels = read('src/utils/shipping-workspace-state.ts');
    assert.match(labels, /urgent:\s*'Urgent'/);
    assert.match(labels, /all:\s*'All'/);
    const header = stripBlockComments(read(HEADER));
    assert.match(header, /SHIPPING_WORKSPACE_TAB_LABEL/);
    assert.match(header, /['"]all['"]/);
    const view = stripBlockComments(read(VIEW));
    assert.match(view, /TechAllTriageTable/);
    assert.match(view, /scope=["']shipping["']/);
  });

  it('queue multi-select uses order rail plane (no ContextualSelectionBar / bulkBarInset)', () => {
    const src = stripBlockComments(read(VIEW));
    assert.match(src, /useOrderRailSelection/);
    assert.match(src, /OrderRailShell/);
    assert.match(src, /railSelection/);
    assert.doesNotMatch(
      src,
      /ContextualSelectionBar/,
      'Shipping must not remount the bottom selection capsule — History rail SoT',
    );
    assert.doesNotMatch(
      src,
      /bulkBarInset/,
      'Shipping must not reserve capsule scroll inset — rail pushes instead',
    );
  });
});
