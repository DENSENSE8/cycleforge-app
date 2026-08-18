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
    assert.match(
      list,
      /STATION_SECONDARY_BAND_FACE/,
      'group eyebrows share the h-6 secondary band with left-rail · commerce row 2',
    );
    assert.match(
      list,
      /first:pt-0/,
      'first group is flush under the Displays top band (aligns with commerce row 2)',
    );
  });

  it('reserves a layout-stable armed marker + activeId glow', () => {
    const list = read(LIST);
    assert.match(list, /data-display-index-armed-marker/);
    assert.match(list, /activeId/);
    assert.match(list, /data-active/);
    // Armed face = `>` + bottom track — never left rail / shaded wash stack.
    assert.match(list, /data-display-index-armed-chevron/);
    assert.match(list, /ARMED_CURSOR_CHEVRON_CLASS/);
    assert.match(list, /ChevronRight/);
    // Idle peers stay flush leftmost — no empty reserved chevron gutter.
    assert.doesNotMatch(
      list,
      /ARMED_CURSOR_CHEVRON_SLOT|CHEVRON_SLOT_CLASS/,
      'never reserve an idle chevron column that shifts every icon',
    );
    assert.match(
      list,
      /isArmed \? \(\s*<span data-display-index-armed-chevron/,
      '`>` mounts only when armed — not an always-on empty slot',
    );
    assert.doesNotMatch(list, /border-l-accent-bg/);
    assert.doesNotMatch(list, /isArmed && ['"]border-l|isArmed && [`'].*bg-accent-bg\/10/);
    // Armed rows suppress focusRing (blue ring-offset bands ≠ selection face).
    // Source keeps a `ds-allow-focus` comment for the focus-ring ratchet (stripped here).
    assert.match(list, /isArmed\s*\?\s*['"]outline-none['"]/);
    // Must not use margin tricks that reflow on focus.
    assert.doesNotMatch(list, /focus-visible:ml-|focus:ml-|hover:ml-/);
  });

  it('character-select: wrap cursor + accent track pulse + sync commit', () => {
    const list = read(LIST);
    const hook = read('src/components/station/displays/useArmedCursorList.ts');
    const face = read('src/components/station/displays/armed-cursor-face.ts');
    // Cursor owns armed paint; activeId only seeds (last opened leaf).
    assert.match(list, /useArmedCursorList/);
    assert.match(list, /data-display-index-cursor/);
    assert.match(list, /regionActive:\s*rightOwnsKeyboard/);
    assert.match(hook, /function seedCursorId/);
    assert.match(hook, /regionActive/);
    assert.match(hook, /addEventListener\(\s*['"]keydown['"]/);
    // ↑↓ wrap modulo the flattened absolute order (not edge clamp).
    assert.match(hook, /\(idx \+ 1\) % orderedIds\.length/);
    assert.match(
      hook,
      /\(idx - 1 \+ orderedIds\.length\) % orderedIds\.length/,
    );
    // Filter-box path — ↑↓ without stealing input focus; Enter/Esc in the list host.
    assert.match(hook, /handleFilterNavKeyDown/);
    assert.match(hook, /focus:\s*false/);
    assert.match(list, /onFilterKeyDown/);
    assert.match(list, /useImperativeHandle/);
    assert.match(list, /StationDisplayIndexFilterKeys/);
    const stack = read(STACK);
    assert.match(
      stack,
      /onKeyDown=\{\(e\) => indexFilterKeysRef\.current\?\.onFilterKeyDown\(e\)\}/,
      'index-filter TechRailSearchBar must drive the list from the box',
    );
    assert.match(
      stack,
      /indexFilterKeysRef=\{indexFilterKeysRef\}/,
      'PushStack wires filter keys into DisplaysIndexLeafStage',
    );
    // Face tokens — selection ink = operator accent + bare animate-pulse.
    assert.match(face, /ARMED_CURSOR_TRACK_CLASS/);
    assert.match(face, /ARMED_CURSOR_MARKER_PULSE_CLASS/);
    assert.match(face, /bg-accent-bg/);
    assert.match(face, /text-accent-bg/);
    assert.match(face, /ARMED_CURSOR_MARKER_PULSE_CLASS\s*=\s*['"]animate-pulse['"]/);
    assert.doesNotMatch(
      face,
      /motion-safe:animate-pulse/,
      'motion-safe: silently no-ops under OS Reduce Motion — use JS useReducedMotion',
    );
    assert.match(list, /ARMED_CURSOR_TRACK_CLASS/);
    assert.match(list, /ARMED_CURSOR_MARKER_PULSE_CLASS/);
    assert.match(list, /data-display-index-content-nudge/);
    assert.match(list, /data-display-index-tone-chip/);
    assert.match(list, /data-display-index-armed-track/);
    // Never a local amber selection track (amber = attention chips only).
    assert.doesNotMatch(list, /bg-amber-400/);
    assert.doesNotMatch(face, /bg-amber-400/);
    // Lead cluster (flush) closes before trailing chip.
    assert.match(
      list,
      /data-display-index-content-nudge[\s\S]*?<\/span>\s*\{showChip \?/,
      'tone chip must mount after the lead cluster closes',
    );
    // Arm highlight is an INSTANT hard cut — no layoutId travel / spring track.
    assert.doesNotMatch(
      list,
      /layoutId/,
      'Displays index arm must not FLIP the track — remount paints instantly',
    );
    assert.doesNotMatch(
      list,
      /LayoutGroup/,
      'no LayoutGroup on the Displays index — arm is not shared-element travel',
    );
    assert.doesNotMatch(
      list,
      /framerTransition\.armedTrack|motionRole\.push\.rail/,
      'arm must not use armedTrack spring or push.rail',
    );
    assert.doesNotMatch(
      list,
      /stiffness\s*:/,
      'no inline spring physics on the Displays index',
    );
    // Right-rail commit is sync — never a hit-marker timer before leaf paint.
    assert.match(hook, /commitArmed/);
    assert.match(
      hook,
      /onCommit\(id\);\s*\n\s*setCursorId\(id\)/,
      'commitArmed must call onCommit before cursor paint (no chevron-first frame)',
    );
    assert.match(
      hook,
      /handleCommitPointerDown/,
      'mouse commits on pointerdown — same turn as keyboard Enter',
    );
    assert.match(
      list,
      /handleCommitPointerDown/,
      'index rows commit on pointerdown (mouse = keyboard)',
    );
    assert.doesNotMatch(
      hook,
      /setTimeout[\s\S]{0,120}onCommit/,
      'never withhold Displays DOM behind a commit timer',
    );
    assert.doesNotMatch(list, /motionRole\.feedback\.hitMarker/);
    assert.doesNotMatch(list, /data-display-index-commit/);
    assert.doesNotMatch(list, /data-display-index-selection-pulse/);
    assert.doesNotMatch(list, /ARMED_CURSOR_SYNC_LABEL/);
    // No full-row Infinity / focus-margin reflow / content translate.
    assert.doesNotMatch(list, /data-display-index-cursor-pulse/);
    assert.doesNotMatch(list, /repeat:\s*Infinity/);
    assert.doesNotMatch(hook, /repeat:\s*Infinity/);
    assert.doesNotMatch(hook, /stiffness\s*:/);
    assert.doesNotMatch(list, /focus-visible:ml-|focus:ml-|hover:ml-/);
    assert.doesNotMatch(list, /translate-x-/);
    // Wedge-safe: no Tab trap, no bare digits, no raw motion/react import.
    assert.doesNotMatch(list, /e\.key === ['"]Tab['"]|key === ['"]Tab['"]/);
    assert.doesNotMatch(list, /addEventListener\(\s*['"]keydown['"]/);
    assert.doesNotMatch(list, /from ['"]motion\/react['"]/);
    assert.doesNotMatch(list, /from ['"]framer-motion['"]/);
    assert.doesNotMatch(hook, /from ['"]motion\/react['"]/);
    // No UI audio on this surface — hardware wedge owns the beep.
    assert.doesNotMatch(list, /AudioContext|HTMLAudioElement|new Audio\(|playScanTone/);
    assert.doesNotMatch(hook, /AudioContext|HTMLAudioElement|new Audio\(|playScanTone/);
    assert.doesNotMatch(list, /Loader2|animate-spin|Spinner/);
    assert.doesNotMatch(list, /text-\[\d+px\]/);
    assert.match(list, /text-role-caption/);
    assert.match(list, /text-role-micro|ARMED_CURSOR_CHIP_FACE_CLASS/);
  });

  it('row hit height uses py-3 (~44–48px), left-clustered icon+label', () => {
    const list = read(LIST);
    assert.match(list, /py-3/);
    assert.match(list, /gap-2/);
    assert.match(list, /min-w-0 flex-1 truncate/);
    // Hit floor stays py-3 — density is type roles + binary-cut arm, not pad shrink.
    assert.doesNotMatch(
      list,
      /\bpy-1\.5\b|\bpy-2\b|\bpy-2\.5\b/,
      'do not silently shrink below the measured ~44px hit floor',
    );
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

  it('push stack passes lastLeafId into DisplaysIndexLeafStage', () => {
    const stack = read(STACK);
    assert.match(stack, /DisplaysIndexLeafStage/);
    assert.match(stack, /lastLeafId=\{lastLeafId\}/);
  });

  it('leaf header is top-left ← → + current title only (no ancestor jump crumbs)', () => {
    const header = read('src/components/station/displays/StationDisplayLeafHeader.tsx');
    assert.match(header, /data-testid="station-displays-history-back"/);
    assert.match(header, /data-testid="station-displays-history-forward"/);
    assert.match(header, /data-station-displays-leaf-title/);
    assert.match(header, /data-breadcrumb-kind="current"/);
    assert.match(header, /ArrowLeft/);
    assert.match(header, /ArrowRight/);
    assert.match(header, /aria-current="page"/);
    assert.equal(
      (header.match(/<button/g) ?? []).length,
      2,
      'leaf header: exactly history back · history forward (title is not a button)',
    );
    assert.doesNotMatch(
      header,
      /IconButton/,
      'history chevrons are plain buttons — never IconButton beside a dead title',
    );
    assert.doesNotMatch(
      header,
      /data-breadcrumb-kind="ancestor"|onJumpToSegment/,
      'ancestor jump crumbs are retired — depth is ← → / Esc only',
    );
    // Verifiable 24px height — shared STATION_SECONDARY_BAND_FACE (h-6) eyebrow.
    assert.match(header, /STATION_SECONDARY_BAND_FACE/);
    assert.match(
      header,
      /STATION_CHROME_SEAM_HAIRLINE/,
      'leaf hairline is the shared seam token — never border-b that notches Displays border-l',
    );
    assert.doesNotMatch(
      header,
      /\bh-10\b/,
      'leaf header must be the 24px eyebrow band, not a 40px chrome band',
    );
    // Resize sash is z-sticky full-height. Leaf nav matches the column top band:
    // z-header + pointer-events-none so ← → can re-enable hits above the sash
    // without blanketing the leading seam (title gutter still lets drag through).
    assert.match(header, /z-header/);
    assert.match(
      header,
      /pointer-events-none/,
      'leaf eyebrow must not blanket the inset resize sash — children re-enable hits',
    );
    assert.match(
      header,
      /pointer-events-auto/,
      'history ← → / trailing must re-enable pointer-events above the sash',
    );
    assert.match(
      header,
      /\bsticky\b/,
      'leaf eyebrow must stay sticky for scroll — place sticky AFTER seam token so tailwind-merge does not drop it for relative',
    );
    // Must not dump the whole path as the only title control.
    assert.doesNotMatch(
      header,
      /data-testid="station-displays-back"/,
      'path-as-title Back row is retired — title is current segment only',
    );
  });

  it('push stack owns leaf trail + visit history + chrome provider', () => {
    const stack = read(STACK);
    const chrome = read('src/components/station/displays/displays-leaf-chrome.tsx');
    const history = read('src/components/station/displays/displays-visit-history.ts');
    assert.match(stack, /leafTrail/);
    assert.match(stack, /DisplaysLeafChromeProvider/);
    assert.match(stack, /popOne/);
    assert.match(stack, /setTrail/);
    assert.match(stack, /setOnNestedPop/);
    assert.match(stack, /setOnNestedRestore/);
    assert.doesNotMatch(stack, /setOnNestedJump|jumpToSegment|onJumpToSegment/);
    assert.match(stack, /goVisitBack|goForward/);
    assert.match(stack, /visitFrame/);
    assert.match(stack, /onVisitNavigate/);
    assert.match(history, /pushVisitFrame/);
    assert.match(history, /goVisitForward/);
    assert.match(
      history,
      /!isIndexTab\(state\.present\.tab\) && !isIndexTab\(next\.tab\)/,
      'cockpit Photos→Units must not stack prior leaf under Back',
    );
    assert.match(
      stack,
      /onIndex \|\| !canHistoryBack/,
      'Root Index Back closes — never "Back to Photos" on the topic list',
    );
    assert.match(chrome, /useDisplaysLeafChrome/);
    assert.match(chrome, /DisplaysBreadcrumbSegment/);
    assert.match(chrome, /setOnNestedRestore/);
    assert.doesNotMatch(chrome, /setOnNestedJump/);
  });
});
