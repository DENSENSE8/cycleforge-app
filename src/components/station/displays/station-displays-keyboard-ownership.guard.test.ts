/**
 * Station Displays keyboard ownership — ↑/↓ belong to the open Displays column,
 * never to the collection map / record cursor behind it.
 *
 * Two failure modes this pins, both reported from the bench:
 *   1. "peek popup" — an arrow with a Displays row focused stepped the receiving
 *      table and popped its row peek.
 *   2. "double sidebars" — an arrow with focus on the `←|` toggle (i.e. NOT on a
 *      row) stepped the table behind the open column and opened a 2nd inspector.
 *
 * The contract: the Displays list OWNS ↑/↓/Home/End while focused (roving), the
 * whole open push column carries a presence marker, and every ambient receiving
 * keyboard yields on BOTH the focus-within check and the region-open check.
 *
 *   node --import tsx --test src/components/station/displays/station-displays-keyboard-ownership.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const read = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));

const SCOPE = 'src/lib/keyboard/list-key-scope.ts';
const INDEX_LIST = 'src/components/station/displays/StationDisplayIndexList.tsx';
const PUSH_COLUMN = 'src/components/station/displays/StationDisplaysPushColumn.tsx';
const RECORD_KEYBOARD = 'src/hooks/useRecordCursorKeyboard.ts';
const LINE_NAV = 'src/components/sidebar/receiving/useReceivingLineNavigation.ts';

describe('Station Displays keyboard ownership', () => {
  it('the scope module exports both the focus-within and region-open contracts', () => {
    const scope = read(SCOPE);
    assert.match(scope, /export const LIST_KEY_OWNER_ATTR = 'data-list-key-owner'/);
    assert.match(scope, /export const LIST_KEY_REGION_OPEN_ATTR = 'data-list-key-region-open'/);
    assert.match(scope, /export function focusWithinListKeyOwner/);
    assert.match(scope, /export function isListKeyRegionOpen/);
    // isListKeyRegionOpen is a live DOM-presence read, not a stubbed const.
    assert.match(scope, /document\.querySelector\(REGION_OPEN_SELECTOR\)/);
  });

  it('the Displays index owns Arrow/Home/End and marks itself a list-key owner', () => {
    const list = read(INDEX_LIST);
    assert.match(list, /LIST_KEY_OWNER_ATTR/, 'root stamps the owner marker');
    // Roving nav consumes the keys and stops them reaching the window listeners.
    assert.match(list, /ArrowDown/);
    assert.match(list, /ArrowUp/);
    assert.match(list, /'Home'/);
    assert.match(list, /'End'/);
    assert.match(list, /\.stopPropagation\(\)/, 'roving nav stops propagation');
    assert.match(list, /rowRefs\.current\.get\([\s\S]*?\)\?\.focus\(\)/, 'moves focus between rows');
  });

  it('the open push column carries the region-open presence marker', () => {
    const column = read(PUSH_COLUMN);
    assert.match(column, /LIST_KEY_REGION_OPEN_ATTR/);
    // It lives on the <aside> so it is present for BOTH index and leaf views.
    assert.match(
      column,
      /<aside[\s\S]*?\[LIST_KEY_REGION_OPEN_ATTR\]/,
      'marker is on the column aside, not a nested branch',
    );
  });

  it('the record cursor yields on focus-within AND on an open Displays column', () => {
    const src = read(RECORD_KEYBOARD);
    assert.match(src, /import\s*\{[^}]*focusWithinListKeyOwner[^}]*isListKeyRegionOpen[^}]*\}/);
    assert.match(src, /if \(focusWithinListKeyOwner\(e\.target\)\) return;/);
    assert.match(src, /if \(isListKeyRegionOpen\(\)\) return;/);
    // Both bails must sit ABOVE the arrow / j-k step branches.
    const guardIdx = src.indexOf('isListKeyRegionOpen()');
    const stepIdx = src.indexOf("code === 'KeyJ'");
    assert.ok(guardIdx !== -1 && stepIdx !== -1 && guardIdx < stepIdx, 'bail precedes the step branches');
    // …but Escape is handled first, so the column can still be dismissed.
    assert.ok(src.indexOf("code === 'Escape'") < guardIdx, 'Escape stays owned');
  });

  it('the receiving line-nav arrow bridge yields the same two ways', () => {
    const src = read(LINE_NAV);
    assert.match(src, /import\s*\{[^}]*focusWithinListKeyOwner[^}]*isListKeyRegionOpen[^}]*\}/);
    assert.match(src, /if \(focusWithinListKeyOwner\(event\.target\)\) return;/);
    assert.match(src, /if \(isListKeyRegionOpen\(\)\) return;/);
    // The bails must precede the dispatch that steps the table + pops the peek.
    const guardIdx = src.indexOf('isListKeyRegionOpen()');
    const dispatchIdx = src.indexOf("'receiving-navigate-table'");
    assert.ok(guardIdx !== -1 && dispatchIdx !== -1 && guardIdx < dispatchIdx, 'bail precedes the dispatch');
  });
});
