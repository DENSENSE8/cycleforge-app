/**
 * Pack Sheets flush chrome — pin PackWorkspaceView to Unbox recipe hosts.
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
const VIEW = 'src/components/packer/PackWorkspaceView.tsx';
const HEADER = 'src/components/packer/PackWorkspaceHeader.tsx';

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

/** Strip block comments so doc prose cannot trip import/host bans. */
function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('Pack Sheets flush chrome', () => {
  it('PackWorkspaceView composes the Sheets shell (not guttered columns)', () => {
    const src = stripBlockComments(read(VIEW));
    // The recipe moved into WorkbenchSheetView (2d): the page composes it and no
    // longer holds the tokens, so it cannot drift from its sibling sheets. Token
    // ownership is asserted once in `workbench-sheet-view.guard.test.ts`.
    assert.match(src, /<WorkbenchSheetView/);
    assert.match(src, /useWorkbenchSheetChrome/);
    assert.doesNotMatch(
      src,
      /WORKBENCH_CHROME_COLUMN/,
      'Pack chrome must use WORKBENCH_SHEET_CHROME — no WORKBENCH_GUTTERS side pad',
    );
    assert.doesNotMatch(
      src,
      /WORKBENCH_BODY_COLUMN/,
      'Pack body must be WORKBENCH_SHEET_HOST — not the padded framed body',
    );
    assert.doesNotMatch(
      src,
      /WORKBENCH_GUTTERS/,
      'Do not reintroduce WORKBENCH_GUTTERS on the Pack desk',
    );
    assert.doesNotMatch(
      src,
      /WORKBENCH_TABLE_VIEWPORT/,
      'Pack History must not reintroduce the framed WORKBENCH_TABLE_VIEWPORT island',
    );
  });

  it('chrome stack is tabs · KPI · triage (search not on the tab row)', () => {
    const view = stripBlockComments(read(VIEW));
    assert.match(view, /PackTriageBand/);
    const header = stripBlockComments(read(HEADER));
    const headerFn = header.slice(header.indexOf('export function PackWorkspaceHeader'));
    const triageFnStart = headerFn.indexOf('export function PackTriageBand');
    const band1 = headerFn.slice(0, triageFnStart > 0 ? triageFnStart : undefined);
    assert.doesNotMatch(
      band1,
      /TechRailSearchBar/,
      'Tab band must not host search — PackTriageBand owns find',
    );
    assert.doesNotMatch(
      band1,
      /OutboundExactFilters/,
      'Tab band must not host filters — PackTriageBand owns refine',
    );
    assert.match(header, /export function PackTriageBand/);
    assert.match(header, /WorkbenchTriageBand/);
  });

  it('KPI sits in the pinned chrome stack (not a body mb-4 island)', () => {
    const src = stripBlockComments(read(VIEW));
    assert.match(src, /kpi=\{/);
    const kpiJsx = src.indexOf('<PackKpiStrip');
    assert.ok(kpiJsx >= 0, 'PackKpiStrip must remain mounted as JSX');
    // The shell renders `kpi` in the chrome stack and `children` in the sheet
    // host, so preceding the body render-prop IS "above the sheet".
    const bodyUsage = src.indexOf('{({ controlsEl })') >= 0
      ? src.indexOf('{({ controlsEl })')
      : src.indexOf('{() => (');
    assert.ok(bodyUsage >= 0, 'body must be the shell children render-prop');
    assert.ok(
      kpiJsx < bodyUsage,
      'PackKpiStrip must sit inside the sheet chrome stack, above the shell body',
    );
    assert.doesNotMatch(
      src,
      /\bmb-4\b/,
      'Do not float KPI in an mb-4 body island — seat it in the chrome band',
    );
  });

  it('the tab band takes its flush face from the shell', () => {
    const src = read(VIEW);
    const headerStart = src.indexOf('<PackWorkspaceHeader');
    assert.ok(headerStart >= 0, 'PackWorkspaceHeader must exist');
    const headerEnd = src.indexOf('/>', headerStart);
    const headerBlock = src.slice(
      headerStart,
      headerEnd > 0 ? headerEnd + 2 : headerStart + 500,
    );
    assert.match(headerBlock, /className=\{className\}/, 'Band 1 must forward the shell-supplied flush face');
    assert.match(src, /tabs=\{\(\{ className \}\)/, 'tabs slot must receive the face class');
  });

  it('Band 1 keeps New Order trailing; Band 2 rides the shell KPI slot', () => {
    const src = stripBlockComments(read(VIEW));
    assert.match(src, /kpi=\{/);
    assert.match(src, /PackTriageBand/);
    const header = stripBlockComments(read(HEADER));
    assert.match(header, /WorkbenchKpiCollapseToggle/);
    const headerFn = header.slice(header.indexOf('export function PackWorkspaceHeader'));
    const triageFnStart = headerFn.indexOf('export function PackTriageBand');
    const band1 = headerFn.slice(0, triageFnStart > 0 ? triageFnStart : undefined);
    assert.match(band1, /WorkbenchTrailingCluster/);
    assert.match(band1, /OutboundOrderChromeActions/);
  });

  it('queue multi-select uses order rail plane (no ContextualSelectionBar / bulkBarInset)', () => {
    const src = stripBlockComments(read(VIEW));
    assert.match(src, /useOrderRailSelection/);
    assert.match(src, /OrderRailShell/);
    assert.match(src, /railSelection/);
    assert.doesNotMatch(
      src,
      /ContextualSelectionBar/,
      'Pack must not remount the bottom selection capsule — History rail SoT',
    );
    assert.doesNotMatch(
      src,
      /bulkBarInset/,
      'Pack must not reserve capsule scroll inset — rail pushes instead',
    );
  });
});
