import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  CURSOR_LABEL_MAX_CHARS,
  canRideCursor,
  clearCursorLabel,
  isCursorLabelHostLive,
  publishCursorLabel,
  readCursorLabel,
  setCursorLabelHost,
} from './cursor-label';

const src = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');

// LANE ADAPTATION (2026-09-15): this tree ported the cursor-FOLLOW tooltip
// (`CursorLabelLayer`) WITHOUT the custom cursor (operator: "do not use the
// custom cursor, just use the follow tooltip"). Mainline's MorphCursorLayer,
// scrub, native-title lifting, chord keycaps and SiteTooltipProvider laws
// resume when the mainline merge brings those components; the channel laws
// below are untouched.

test('only a short single-line string may ride the cursor', () => {
  assert.equal(canRideCursor('Copy tracking'), true);
  assert.equal(canRideCursor(''), false);
  assert.equal(canRideCursor('a\nb'), false, 'multi-line stays on the bubble');
  assert.equal(canRideCursor('x'.repeat(CURSOR_LABEL_MAX_CHARS + 1)), false);
  assert.equal(canRideCursor(null), false);
  assert.equal(canRideCursor({ type: 'span' }), false, 'rich labels stay on the bubble');
});

test('nothing is published while no layer is live — the bubble is the fallback', () => {
  assert.equal(isCursorLabelHostLive(), false);
  publishCursorLabel('a', 'rides nowhere');
  assert.equal(readCursorLabel(), null);
});

test('a leave clears only the label it owns; the host going dark clears all', () => {
  setCursorLabelHost(true);
  publishCursorLabel('a', 'A');
  clearCursorLabel('b');
  assert.equal(readCursorLabel()?.text, 'A', "b's leave cannot wipe a's label");
  setCursorLabelHost(false);
  assert.equal(readCursorLabel(), null, 'host dark clears every label');
});

test('the follower hosts the label — never the custom cursor', () => {
  const layer = src('./CursorLabelLayer.tsx');
  assert.match(layer, /setCursorLabelHost\(enabled\)/);
  assert.match(layer, /return \(\) => setCursorLabelHost\(false\)/);
  assert.match(layer, /data-testid="cursor-label-chip"/);
  // The chip's skin comes from the SoT; this host only positions it.
  assert.match(layer, /tooltipChipClass\(\)/);
  // The corner comes from the named dropdown-shell constant — the ROLE
  // ladder renders rounded-none in this theme's industrial wave, so a
  // `cornerClass('control')` here would paint the chip square.
  assert.match(layer, /DROPDOWN_SHELL_CORNER/, 'the chip is rounded');
  // Seated per pointer frame and flipped at the viewport edges — never a
  // static offset that clips on the right or bottom.
  assert.match(layer, /window\.innerWidth - LABEL_MARGIN/);
  assert.match(layer, /window\.innerHeight - LABEL_MARGIN/);
  // The OS cursor stays: no hiding, no morph art, no skins.
  assert.doesNotMatch(layer, /useHideOsCursor|cursor-skins|CURSOR_HALO/);
});

test('HoverTooltip hands mouse hover to the cursor and keeps the bubble for focus', () => {
  const tip = src('../../components/ui/HoverTooltip.tsx');
  assert.match(tip, /useCursorLabel\(\{ disabled \}\)/);
  assert.match(tip, /cursor\.enter\(label, openDelayMs\)/);
  // Focus never goes to the cursor — keyboard and scan-gun users have no pointer.
  assert.match(
    tip,
    /onFocusTrigger = \(\) => \{\s*if \(disabled\) return;[\s\S]*?if \(cursor\.riding\(\)\) return;\s*activate\('focus'/,
  );
  assert.match(tip, /cursor\.leave\(\);/);
  assert.match(tip, /role="tooltip"/, 'the anchored bubble still exists');
});

test('one skin, one content order — the chip SoT cannot drift', () => {
  // Ground, type and spacing are decided once, in TooltipChip; a host owns
  // only its position and its corner.
  const chip = src('../primitives/TooltipChip.tsx');
  assert.match(chip, /export function tooltipChipClass/);
  assert.match(chip, /export function TooltipChipBody/);
  assert.match(chip, /bg-surface-inverse/);
  // Assert against the emitted class expression, not the file text — the doc
  // deliberately names the roles it bans, so a file-wide regex would trip on
  // its own explanation.
  const chipClasses = (chip.match(/return cn\(([\s\S]*?)\n {2}\);/) ?? [])[1] ?? '';
  assert.ok(chipClasses.length > 0, 'tooltipChipClass must build its classes with cn()');
  // Readable first: the sans cut at 13px, weight 500, sentence case.
  assert.match(chipClasses, /text-role-nav font-medium/);
  // role-micro / role-eyebrow bind the CONDENSED family — a narrow counter is
  // the wrong trade for a sentence read by someone who does not yet know what
  // the control does.
  assert.doesNotMatch(chipClasses, /role-micro|role-eyebrow/);
  assert.doesNotMatch(chipClasses, /uppercase|font-semibold/);
  // ONE ROW is the default. The chip is an absolute box inside a zero-width
  // follower — wrapping collapses it to one word per line.
  assert.match(chipClasses, /wrap \? '[^']*whitespace-pre-line[^']*' : 'whitespace-nowrap'/);
  assert.match(chipClasses, /text-pretty/, 'an unavoidable wrap stays minimal');

  // The follower takes the SoT skin; it never re-paints ground or type.
  const layer = src('./CursorLabelLayer.tsx');
  assert.match(layer, /TooltipChipBody label=/, 'the follower renders the SoT body');
  assert.match(layer, /tooltipChipClass\(\)/, 'the follower takes the SoT skin');
  assert.doesNotMatch(layer, /bg-surface-inverse'|text-role-caption/, 'the follower re-paints the chip');
  // The follower may never ask the chip to wrap.
  assert.doesNotMatch(layer, /tooltipChipClass\(\{[^}]*wrap/, 'the cursor chip must never opt into wrapping');
});

// NOT PORTED to this lane (resume at mainline merge): the hotkey-chord hint
// law (HotkeyTooltip + KeyboardChord + ComposerModeRow cursor kinds) and the
// native-title lifting law — both depend on MorphCursorLayer machinery this
// tree deliberately left behind with the custom cursor.
