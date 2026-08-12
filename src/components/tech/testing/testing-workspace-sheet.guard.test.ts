/**
 * Testing Sheets flush chrome — pin TestingWorkspaceView to Unbox recipe hosts.
 *
 * Tabs · KPI · triage live in `WORKBENCH_SHEET_CHROME` (no side gutters); body
 * is `WORKBENCH_SHEET_HOST`. Never reintroduce `WORKBENCH_CHROME_COLUMN` /
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
const VIEW = 'src/components/tech/testing/TestingWorkspaceView.tsx';
const HEADER = 'src/components/tech/testing/TestingWorkspaceHeader.tsx';
const HISTORY = 'src/components/tech/TestingHistoryList.tsx';

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

/** Strip block comments so doc prose cannot trip import/host bans. */
function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('Testing Sheets flush chrome', () => {
  it('TestingWorkspaceView composes the Sheets shell (not guttered columns)', () => {
    const src = stripBlockComments(read(VIEW));
    // The recipe moved into WorkbenchSheetView (2d) — the page composes it and no
    // longer holds the tokens. Token ownership: `workbench-sheet-view.guard.test.ts`.
    assert.match(src, /<WorkbenchSheetView/);
    assert.match(src, /useWorkbenchSheetChrome/);
    assert.doesNotMatch(
      src,
      /WORKBENCH_CHROME_COLUMN/,
      'Testing chrome must use WORKBENCH_SHEET_CHROME — no WORKBENCH_GUTTERS side pad',
    );
    assert.doesNotMatch(
      src,
      /WORKBENCH_BODY_COLUMN/,
      'Testing body must be WORKBENCH_SHEET_HOST — not the padded framed body',
    );
    assert.doesNotMatch(
      src,
      /WORKBENCH_GUTTERS/,
      'Do not reintroduce WORKBENCH_GUTTERS on the Testing desk',
    );
  });

  it('chrome stack is tabs · KPI · triage (search not on the tab row)', () => {
    const view = stripBlockComments(read(VIEW));
    assert.match(view, /TestingTriageBand/);
    const header = stripBlockComments(read(HEADER));
    const headerFn = header.slice(header.indexOf('export function TestingWorkspaceHeader'));
    const triageFnStart = headerFn.indexOf('export function TestingTriageBand');
    const band1 = headerFn.slice(0, triageFnStart > 0 ? triageFnStart : undefined);
    assert.doesNotMatch(
      band1,
      /TechRailSearchBar/,
      'Tab band must not host search — TestingTriageBand owns find',
    );
    assert.doesNotMatch(
      band1,
      /QueueSortSwitch/,
      'Tab band must not host sort — TestingTriageBand owns icon sort',
    );
    assert.match(header, /export function TestingTriageBand/);
    assert.match(header, /WorkbenchTriageBand/);
  });

  it('KPI sits in the pinned chrome stack (not a body mb-4 island)', () => {
    const src = stripBlockComments(read(VIEW));
    assert.match(src, /kpi=\{/, 'Band 2 rides the shell kpi slot');
    const kpiJsx = src.indexOf('<TestingKpiStrip');
    assert.ok(kpiJsx >= 0, 'TestingKpiStrip must remain mounted as JSX');
    // The shell renders `kpi` in the chrome stack and `children` in the sheet
    // host, so preceding the body render-prop IS "above the sheet".
    const bodyStart = src.indexOf('{({ controlsEl })');
    assert.ok(bodyStart >= 0, 'body must be the shell children render-prop');
    assert.ok(kpiJsx < bodyStart, 'TestingKpiStrip must ride the kpi slot, above the body');
    assert.doesNotMatch(
      src,
      /\bmb-4\b/,
      'Do not float KPI in an mb-4 body island — seat it in the chrome band',
    );
  });

  it('the tab band takes its flush face from the shell', () => {
    const src = read(VIEW);
    const headerStart = src.indexOf('<TestingWorkspaceHeader');
    assert.ok(headerStart >= 0, 'TestingWorkspaceHeader must exist');
    const headerEnd = src.indexOf('/>', headerStart);
    const headerBlock = src.slice(headerStart, headerEnd > 0 ? headerEnd + 2 : headerStart + 500);
    // `rounded-none border-l-0 border-t-0 shadow-sm` is the shell's
    // WORKBENCH_SHEET_TABS_CLASS, handed to the tabs slot. Re-typing it per page
    // is how five sheets drifted; the page only forwards it.
    assert.match(
      headerBlock,
      /className=\{className\}/,
      'Band 1 must forward the shell-supplied flush face',
    );
    assert.match(src, /tabs=\{\(\{ className \}\)/, 'tabs slot must receive the face class');
  });

  it('Band 2 rides the shell KPI slot; triage hosts the collapse toggle', () => {
    const src = stripBlockComments(read(VIEW));
    assert.match(src, /kpi=\{/);
    assert.match(src, /TestingTriageBand/);
    const header = stripBlockComments(read(HEADER));
    assert.match(header, /WorkbenchKpiCollapseToggle/);
  });

  it('TestingHistoryList does not wrap the sheet grid in WorkbenchTablePane', () => {
    const src = stripBlockComments(read(HISTORY));
    assert.doesNotMatch(
      src,
      /WorkbenchTablePane/,
      'Testing grid must mount flush — no framed WorkbenchTablePane card island',
    );
  });

  it('triage hosts icon Priority (not Band 1)', () => {
    const header = stripBlockComments(read(HEADER));
    const headerFn = header.slice(header.indexOf('export function TestingWorkspaceHeader'));
    const triageFnStart = headerFn.indexOf('export function TestingTriageBand');
    const triage = headerFn.slice(triageFnStart > 0 ? triageFnStart : 0);
    assert.match(
      triage,
      /QueueSortSwitch[\s\S]*variant=["']icon["']/,
      'Triage Priority must be the icon-only QueueSortSwitch variant',
    );
  });

  it('Band 1 includes Urgent and All; All mounts TechAllTriageTable', () => {
    // Labels live in the workspace-state SoT — header maps via TAB_LABEL[id].
    const labels = read('src/utils/testing-workspace-state.ts');
    assert.match(labels, /urgent:\s*'Urgent'/);
    assert.match(labels, /all:\s*'All'/);
    const header = stripBlockComments(read(HEADER));
    assert.match(header, /TESTING_WORKSPACE_TAB_LABEL/);
    assert.match(header, /['"]all['"]/);
    const view = stripBlockComments(read(VIEW));
    assert.match(view, /TechAllTriageTable/);
    assert.match(view, /scope=["']testing["']/);
  });
});
