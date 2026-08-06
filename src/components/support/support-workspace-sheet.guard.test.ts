/**
 * Support Sheets flush chrome.
 *
 * The ticket BOARD is a spreadsheet plane on the Unbox recipe: Band 1 tabs ·
 * (no KPI — honest absence) · Band 3 triage in `WORKBENCH_SHEET_CHROME`, list
 * flush in `WORKBENCH_SHEET_HOST`. The ticket FOCUS is a service-workspace
 * THREAD (display/workbench-service.md), not a lifecycle grid, so it keeps its
 * PaneHeader + glass conversation — but it must stay FLUSH (no gutter columns)
 * so flipping list ⇄ thread does not shift the edge.
 *
 * SoT: source-of-truth.md → Sheets flush mount recipe;
 * display/workbench-ops-queue.md → Support (Wave 6).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = join(process.cwd());
const BOARD = 'src/components/support/zendesk/SupportTicketsBoard.tsx';
const FOCUS = 'src/components/support/service-workspace/SupportTicketFocus.tsx';

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('Support Sheets flush chrome', () => {
  it('SupportTicketsBoard uses WORKBENCH_SHEET_* hosts (not guttered columns)', () => {
    const src = stripBlockComments(read(BOARD));
    assert.match(src, /WORKBENCH_SHEET_CHROME/);
    assert.match(src, /WORKBENCH_SHEET_HOST/);
    assert.doesNotMatch(src, /WORKBENCH_CHROME_COLUMN/);
    assert.doesNotMatch(src, /WORKBENCH_BODY_COLUMN/);
    assert.doesNotMatch(src, /WORKBENCH_GUTTERS/);
    assert.doesNotMatch(
      src,
      /MONITOR_SECTION_CARD_SCROLL_CLASS/,
      'Ticket board must be a flush spreadsheet plane, not a padded monitor card',
    );
  });

  it('board find lives on Band 3 (WorkbenchTriageBand), after the tab band', () => {
    const src = stripBlockComments(read(BOARD));
    const headerIdx = src.indexOf('<WorkbenchChromeHeader');
    const triageIdx = src.indexOf('<WorkbenchTriageBand');
    const searchIdx = src.indexOf('Search tickets');
    assert.ok(headerIdx >= 0 && triageIdx >= 0 && searchIdx >= 0);
    assert.ok(headerIdx < triageIdx, 'Band 1 tab band precedes Band 3 triage');
    assert.ok(triageIdx < searchIdx, 'Search must sit inside Band 3, not the tab band');
    assert.doesNotMatch(src, /\bmb-4\b/);
  });

  it('board tab band passes Unbox flush face overrides', () => {
    const src = read(BOARD);
    const headerStart = src.indexOf('<WorkbenchChromeHeader');
    const headerBlock = src.slice(headerStart, headerStart + 400);
    assert.match(headerBlock, /border-l-0/);
    assert.match(headerBlock, /border-t-0/);
    assert.match(headerBlock, /rounded-none/);
  });

  it('ticket focus thread stays flush — no gutter columns', () => {
    const src = stripBlockComments(read(FOCUS));
    assert.doesNotMatch(
      src,
      /WORKBENCH_CHROME_COLUMN/,
      'Focus thread must flush its chrome column (edge continuity with the board)',
    );
    assert.doesNotMatch(src, /WORKBENCH_BODY_COLUMN/);
    assert.doesNotMatch(src, /WORKBENCH_GUTTERS/);
  });
});
