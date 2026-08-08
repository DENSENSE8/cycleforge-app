/**
 * Station Displays Root Index chrome — eyebrows, density, layout-stable active,
 * wired hotkeys, group collapse. Never delete eyebrows for zero-whitespace.
 *
 *   node --import tsx --test src/components/station/displays/station-display-index.guard.test.ts
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

const LIST = 'src/components/station/displays/StationDisplayIndexList.tsx';
const SOT = 'src/components/station/displays/display-index.ts';
const STACK = 'src/components/station/displays/StationDisplaysPushStack.tsx';

describe('Station Displays Root Index chrome', () => {
  it('keeps eyebrow group headers (spatial predictability)', () => {
    const list = read(LIST);
    assert.match(list, /<h3[\s\S]*?\{section\.label\}/);
    assert.match(list, /groupDisplayIndexRows/);
    assert.doesNotMatch(
      list,
      /zero-whitespace|delete.*eyebrow/i,
      'eyebrows must stay — density is row pad, not header deletion',
    );
  });

  it('reserves a layout-stable armed marker + activeId glow', () => {
    const list = read(LIST);
    assert.match(list, /data-display-index-armed-marker/);
    assert.match(list, /activeId/);
    assert.match(list, /data-active/);
    assert.match(list, /border-l-accent-bg/);
    // Must not use margin tricks that reflow on focus.
    assert.doesNotMatch(list, /focus-visible:ml-|focus:ml-|hover:ml-/);
  });

  it('character-select: absolute cursor wrap + one-shot pulse, no Tab/digit/nudge', () => {
    const list = read(LIST);
    // Cursor owns armed paint; activeId only seeds (last opened leaf).
    assert.match(list, /cursorId/);
    assert.match(list, /data-display-index-cursor/);
    assert.match(list, /seedCursorId/);
    // ↑↓ wrap modulo the flattened absolute order (not edge clamp).
    assert.match(list, /\(idx \+ 1\) % orderedIds\.length/);
    assert.match(
      list,
      /\(idx - 1 \+ orderedIds\.length\) % orderedIds\.length/,
    );
    // One-shot settle via feedback.pulse — never a looping full-row glow.
    assert.match(list, /motionRole\.feedback\.pulse/);
    assert.match(list, /data-display-index-cursor-pulse/);
    assert.doesNotMatch(list, /repeat:\s*Infinity/);
    // No content nudge — icon+label stay flush (armed marker is overlay).
    assert.doesNotMatch(list, /contentVariants|x:\s*24|translate-x-/);
    // Wedge-safe: no Tab trap, no bare digits, no raw motion/react import.
    assert.doesNotMatch(list, /e\.key === ['"]Tab['"]|key === ['"]Tab['"]/);
    assert.doesNotMatch(list, /addEventListener\(\s*['"]keydown['"]/);
    assert.doesNotMatch(list, /from ['"]motion\/react['"]/);
    assert.doesNotMatch(list, /from ['"]framer-motion['"]/);
  });

  it('row hit height uses py-3 (~44–48px), left-clustered icon+label', () => {
    const list = read(LIST);
    assert.match(list, /py-3/);
    assert.match(list, /gap-2/);
    assert.match(list, /min-w-0 flex-1 truncate/);
  });

  it('eyebrow trailing uses summarizeDisplayIndexGroup + wired hotkey map', () => {
    const list = read(LIST);
    const sot = read(SOT);
    assert.match(sot, /export function summarizeDisplayIndexGroup/);
    assert.match(list, /summarizeDisplayIndexGroup/);
    assert.match(list, /station-displays-index-summary-/);

    // SLIM EYEBROW (2026-08-07) — label + action count, nothing else.
    // A per-group Collapse button put COLLAPSE on screen three times over ten
    // rows; a `kbd` chip advertised a Digit1-3 chord that only fired after the
    // operator had tabbed in (a false shortcut hint). Both are banned, and bare
    // digits cannot be bound at all on a bench where a wedge scan types digits.
    for (const banned of [
      /DISPLAY_INDEX_GROUP_HOTKEY/,
      /displayIndexGroupFromHotkeyCode/,
      /station-displays-index-hotkey-/,
      /<kbd/,
      /Digit[123]/,
      /station-displays-index-collapse-/,
      />\s*\{collapsed \? 'Expand' : 'Collapse'\}/,
    ]) {
      assert.doesNotMatch(list, banned, `slim eyebrow: ${banned} must stay out of the index`);
    }
    assert.doesNotMatch(
      sot,
      /'Incomplete'|'Clear'/,
      'a group trailer speaks only for ACTION rows — Context reference rows can never be "Incomplete"',
    );

    // EMPTY IS ANSWERED, NEVER BLANK.
    assert.match(list, /station-displays-index-empty/);
    assert.match(list, /station-displays-index-clear-filter/);
  });

  it('supports local group collapse without inventing Clear All / Updated', () => {
    const list = read(LIST);
    assert.doesNotMatch(list, /Clear All|Updated \d|Override/i);

    // ROW ANATOMY IS FROZEN: chevron gutter · icon · label · tone chip.
    // The whole row is ONE control. A nested button / menu / checkbox makes the
    // row's own click target ambiguous at a bench and is unreachable by the
    // keyboard path the row already owns.
    const rowBody = list.slice(list.indexOf('section.rows.map'));
    for (const nested of [/<IconButton/, /<DropdownMenu/, /<Checkbox/, /<Switch/, /<a\s/]) {
      assert.doesNotMatch(rowBody, nested, `row anatomy: no nested control (${nested}) inside a row`);
    }
    assert.equal(
      (rowBody.match(/<button/g) ?? []).length,
      1,
      'row anatomy: exactly ONE button per row — the row itself',
    );
    // Icons come from the leaf registry, never re-styled per row.
    assert.match(list, /iconById\.get\(row\.id\)/);
    assert.doesNotMatch(rowBody, /TONE_ICON|iconTone|row\.tone\]\s*,?\s*\)?\s*\}\s*\/>/);
  });

  it('push stack passes lastLeafId as activeId when on index', () => {
    const stack = read(STACK);
    assert.match(stack, /lastLeafId/);
    assert.match(stack, /activeId=\{lastLeafId\}/);
  });
});
