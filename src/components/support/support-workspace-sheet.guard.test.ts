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
  it('SupportTicketsBoard composes the Sheets shell (not guttered columns)', () => {
    const src = stripBlockComments(read(BOARD));
    // The recipe moved into WorkbenchSheetView (2d): the page composes the shell
    // and no longer holds the tokens, so it cannot drift from its sibling sheets.
    // Token ownership is asserted once in `workbench-sheet-view.guard.test.ts`.
    assert.match(src, /<WorkbenchSheetView/);
    assert.match(src, /useWorkbenchSheetChrome/);
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

  it('board the tab band takes its flush face from the shell', () => {
    const src = read(BOARD);
    const headerStart = src.indexOf('<WorkbenchChromeHeader');
    const headerBlock = src.slice(headerStart, headerStart + 400);
    // The flush face is the shell's WORKBENCH_SHEET_TABS_CLASS, handed to the
    // tabs slot; the page forwards it. Re-typing it per page is how the sheets
    // drifted — and four of them carried a redundant `rounded-none` the
    // header already applies via cornerClass('flush').
    assert.match(headerBlock, /className=\{className\}/);
    assert.match(src, /tabs=\{\(\{ className \}\)/);
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
