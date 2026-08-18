/**
 * Labels station Sheets flush chrome — pin LabelsWorkspaceView to Unbox recipe hosts.
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
const VIEW = 'src/components/outbound/labels/LabelsWorkspaceView.tsx';
const HEADER = 'src/components/outbound/labels/LabelsWorkspaceHeader.tsx';

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

/** Strip block comments so doc prose cannot trip import/host bans. */
function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('Labels station Sheets flush chrome', () => {
  it('LabelsWorkspaceView uses WORKBENCH_SHEET_* hosts (not guttered columns)', () => {
    const src = stripBlockComments(read(VIEW));
    assert.match(src, /WORKBENCH_SHEET_CHROME/);
    assert.match(src, /WORKBENCH_SHEET_HOST/);
    assert.doesNotMatch(src, /WORKBENCH_CHROME_COLUMN/);
    assert.doesNotMatch(src, /WORKBENCH_BODY_COLUMN/);
    assert.doesNotMatch(src, /WORKBENCH_GUTTERS/);
  });

  it('chrome stack is tabs · KPI · triage (search / filters not on the tab row)', () => {
    const view = stripBlockComments(read(VIEW));
    assert.match(view, /LabelsTriageBand/);
    const header = stripBlockComments(read(HEADER));
    const headerFn = header.slice(header.indexOf('export function LabelsWorkspaceHeader'));
    const triageFnStart = headerFn.indexOf('export function LabelsTriageBand');
    const band1 = headerFn.slice(0, triageFnStart > 0 ? triageFnStart : undefined);
    assert.doesNotMatch(
      band1,
      /TechRailSearchBar/,
      'Tab band must not host search — LabelsTriageBand owns find',
    );
    assert.doesNotMatch(
      band1,
      /OutboundExactFilters/,
      'Tab band must not host filters — LabelsTriageBand owns refine',
    );
    assert.match(header, /export function LabelsTriageBand/);
    assert.match(header, /WorkbenchTriageBand/);
  });

  it('KPI sits in pinned chrome via Unbox WorkbenchKpiBand (not a body mb-4 island)', () => {
    const src = stripBlockComments(read(VIEW));
    assert.match(src, /WorkbenchKpiBand/);
    const kpiJsx = src.indexOf('<LabelsKpiStrip');
    assert.ok(kpiJsx >= 0, 'LabelsKpiStrip must remain mounted as JSX');
    const bodyUsage = src.indexOf('className={WORKBENCH_SHEET_HOST}');
    assert.ok(bodyUsage >= 0, 'WORKBENCH_SHEET_HOST must appear as the body className');
    assert.ok(
      kpiJsx < bodyUsage,
      'LabelsKpiStrip must sit inside the sheet chrome stack, above WORKBENCH_SHEET_HOST',
    );
    assert.doesNotMatch(src, /\bmb-4\b/);
  });

  it('tab band passes Unbox flush face overrides', () => {
    const src = read(VIEW);
    const headerStart = src.indexOf('<LabelsWorkspaceHeader');
    assert.ok(headerStart >= 0);
    const headerEnd = src.indexOf('/>', headerStart);
    const headerBlock = src.slice(headerStart, headerEnd > 0 ? headerEnd + 2 : headerStart + 500);
    assert.match(headerBlock, /border-l-0/);
    assert.match(headerBlock, /border-t-0/);
    assert.match(headerBlock, /rounded-none/);
  });

  it('Band 2 uses WorkbenchKpiBand; triage hosts KPI collapse toggle', () => {
    const src = stripBlockComments(read(VIEW));
    assert.match(src, /WorkbenchKpiBand/);
    assert.match(src, /LabelsTriageBand/);
    const header = stripBlockComments(read(HEADER));
    assert.match(header, /WorkbenchKpiCollapseToggle/);
  });
});
