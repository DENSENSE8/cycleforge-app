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
  readCursorLabelServer,
  setCursorLabelHost,
  subscribeCursorLabel,
} from './cursor-label';
import { CONDITION_DESCRIPTIONS } from '@/lib/conditions';

const src = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');

test('only a short single-line string may ride the cursor', () => {
  assert.equal(canRideCursor('Copy tracking'), true);
  assert.equal(canRideCursor(''), false);
  assert.equal(canRideCursor('a\nb'), false, 'multi-line stays on the bubble');
  assert.equal(canRideCursor('x'.repeat(CURSOR_LABEL_MAX_CHARS + 1)), false);
  assert.equal(canRideCursor(null), false);
  assert.equal(canRideCursor({ type: 'span' }), false, 'rich labels stay on the bubble');
});

test('a hover vocabulary rides as ONE — no grade snaps to the bubble alone', () => {
  // Regression 2026-09-06. Four of the seven grade descriptions overshot the
  // old 48-char cap by 1–7 characters, so one pill strip had two behaviours:
  // Brand new / Used C / For parts followed the pointer while Like new /
  // Refurbished / Used A / Used B snapped to a static anchored bubble. A
  // vocabulary that is authored together must hover together, so this asserts
  // the SET, not a single string — a copy edit that lengthens one grade past
  // the cap has to be caught here rather than by eye on one pill.
  const grades = Object.entries(CONDITION_DESCRIPTIONS);
  assert.ok(grades.length > 0, 'the vocabulary exists');
  const stranded = grades.filter(([, text]) => !canRideCursor(text));
  assert.deepEqual(
    stranded.map(([grade, text]) => `${grade} (${text.length} chars)`),
    [],
    'every condition description must ride the cursor',
  );
});

test('nothing is published while no layer is live — the bubble is the fallback', () => {
  setCursorLabelHost(false);
  assert.equal(isCursorLabelHostLive(), false);
  publishCursorLabel('a', 'Hello');
  assert.equal(readCursorLabel(), null);
  assert.equal(readCursorLabelServer(), null);
});

test('a leave clears only the label it owns; the host going dark clears all', () => {
  setCursorLabelHost(true);
  let ticks = 0;
  const off = subscribeCursorLabel(() => {
    ticks += 1;
  });
  publishCursorLabel('outer', 'Outer');
  publishCursorLabel('inner', 'Inner');
  assert.deepEqual(readCursorLabel(), { owner: 'inner', text: 'Inner' });
  clearCursorLabel('outer');
  assert.deepEqual(readCursorLabel(), { owner: 'inner', text: 'Inner' }, 'stale owner is ignored');
  clearCursorLabel('inner');
  assert.equal(readCursorLabel(), null);
  publishCursorLabel('x', 'X');
  setCursorLabelHost(false);
  assert.equal(readCursorLabel(), null, 'layer unmount / gate flip drops the chip');
  assert.ok(ticks >= 4);
  off();
});

test('the layer hosts the label and the tooltip reads like the bubble', () => {
  const layer = src('./MorphCursorLayer.tsx');
  assert.match(layer, /setCursorLabelHost\(enabled\)/);
  assert.match(layer, /return \(\) => setCursorLabelHost\(false\)/);
  assert.match(layer, /data-testid="morph-cursor-tooltip"/);
  // The chip's skin comes from the SoT; this host only positions it.
  assert.match(layer, /tooltipChipClass\(\{ row: Boolean\(tooltipKeys\) \}\)/);
  assert.match(layer, /cornerClass\('control'\)/, 'the chip is rounded');
  // Seated per pointer frame and flipped at the viewport edges — never a
  // static offset that clips on the right or bottom.
  assert.match(layer, /window\.innerWidth - LABEL_MARGIN/);
  assert.match(layer, /window\.innerHeight - LABEL_MARGIN/);
  // The hand mid-drag wants the number, not the help text.
  assert.match(layer, /scrub \? null : \(cursorLabel\?\.text \?\? label \?\? nativeTitle\)/);
});

test('HoverTooltip hands mouse hover to the cursor and keeps the bubble for focus', () => {
  const tip = src('../../components/ui/HoverTooltip.tsx');
  assert.match(tip, /useCursorLabel\(\{ disabled \}\)/);
  assert.match(tip, /if \(cursor\.enter\(label, openDelayMs, shortcut\)\) return;/);
  // Focus never goes to the cursor — keyboard and scan-gun users have no pointer.
  assert.match(
    tip,
    /onFocusTrigger = \(\) => \{\s*if \(disabled\) return;[\s\S]*?if \(cursor\.riding\(\)\) return;\s*activate\('focus'/,
  );
  assert.match(tip, /cursor\.leave\(\);/);
  assert.match(tip, /role="tooltip"/, 'the anchored bubble still exists');
});

test('one skin, one content order — the tooltip hosts cannot drift', () => {
  // A hint has three hosts: the desk chip (MorphCursorLayer), the anchored
  // bubble (HoverTooltip) and the anchored copy bubble (SiteTooltipProvider).
  // Ground, type, row spacing and content order are decided once, in
  // TooltipChip; a host owns only its position and its corner role.
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
  // ONE ROW is the default, for chord and label alike. Regression 2026-09-06:
  // making nowrap conditional on the chord sent every label-only cursor chip
  // to `whitespace-pre-line`, and the chip is an absolute box inside a
  // zero-width follower — so it wrapped at every word.
  assert.match(chipClasses, /wrap \? '[^']*whitespace-pre-line[^']*' : 'whitespace-nowrap'/);
  assert.match(chipClasses, /text-pretty/, 'an unavoidable wrap stays minimal');
  // The desk chip may never ask to wrap; only the prose bubble may.
  assert.doesNotMatch(
    src('./MorphCursorLayer.tsx'),
    /tooltipChipClass\(\{[^}]*wrap/,
    'the cursor chip must never opt into wrapping',
  );
  assert.match(
    src('../../components/ui/HoverTooltip.tsx'),
    /tooltipChipClass\(\{ row: Boolean\(shortcut\), wrap: !shortcut \}\)/,
  );
  assert.match(
    src('../../components/ui/HoverTooltip.tsx'),
    /shortcut \? 'max-w-none' : 'max-w-\[22rem\]'/,
    'a no-wrap chip must not be capped, or the sentence overflows its ground',
  );
  // The chord is keycaps, never folded into the sentence.
  assert.match(chip, /<KeyboardChord chord=\{chord\} \/>/);

  // The two READING hosts render the SoT body (sentence, then keycaps).
  for (const host of ['./MorphCursorLayer.tsx', '../../components/ui/HoverTooltip.tsx']) {
    const source = src(host);
    assert.match(source, /TooltipChipBody label=/, `${host} renders the SoT body`);
    assert.doesNotMatch(source, /KeyboardChord/, `${host} reaches past the SoT body`);
  }
  // Every host — including the copy bubble, whose body is a value plus a copy
  // glyph rather than a sentence — takes the skin instead of re-painting it.
  for (const host of [
    './MorphCursorLayer.tsx',
    '../../components/ui/HoverTooltip.tsx',
    '../../components/providers/SiteTooltipProvider.tsx',
  ]) {
    const source = src(host);
    assert.match(source, /tooltipChipClass\(\{ row:/, `${host} takes the SoT skin`);
    assert.doesNotMatch(source, /bg-surface-inverse'|bg-surface-inverse /, `${host} re-paints the ground`);
    assert.doesNotMatch(source, /text-role-caption/, `${host} re-sizes the chip type`);
  }
  // A hint you must click holds still; only a read-only hint may follow.
  const copy = src('../../components/providers/SiteTooltipProvider.tsx');
  assert.match(copy, /cornerClass\('control'\)/, 'the copy bubble is rounded like the chip');
  assert.doesNotMatch(copy, /useCursorLabel|publishCursorLabel/, 'a copy target never rides');

  const layer = src('./MorphCursorLayer.tsx');
  assert.match(layer, /dataset\.cursorKeys/, 'the attribute path carries the chord');
  // The chord follows the source that won the text — no cap from a stale hover.
  assert.match(layer, /cursorLabel\s*\?\s*\(cursorLabel\.keys \?\? null\)/);
  assert.match(src('../primitives/KeyboardKey.tsx'), /export function chordKeys/);
});

test('a hotkey hint is one component, and it cannot echo a control label', () => {
  const hint = src('../../components/ui/HotkeyTooltip.tsx');
  // Both required — the API shape is the rule. An optional `chord` would make
  // this a second way to build the label-echo tooltip it exists to prevent.
  assert.match(hint, /\baction: string;/);
  assert.match(hint, /\bchord: string;/);
  assert.doesNotMatch(hint, /action\?: string/);
  assert.doesNotMatch(hint, /chord\?: string/);
  // It composes the routing and the paint; it re-implements neither.
  assert.match(hint, /from '@\/components\/ui\/HoverTooltip'/);
  assert.doesNotMatch(hint, /KeyboardKey|createPortal|useCursorLabel/);

  const row = src('../../components/composer/ComposerModeRow.tsx');
  assert.match(row, /<HotkeyTooltip action="Switch mode"/);
  // The chord is taught on hover, never printed as a standing row of chrome.
  assert.doesNotMatch(row, />\s*\{STATION_COMPOSER_CYCLE_CHORD\}\s*</);
  // An inactive face publishes a cursor KIND and nothing else: no label to
  // echo the word already painted on it.
  assert.match(row, /\{\.\.\.cursorClickTarget\(\)\}/);
  assert.doesNotMatch(row, /cursorClickTarget\(entry\.label/);
});

test('native title attributes ride the cursor and are put back on leave', () => {
  const layer = src('./MorphCursorLayer.tsx');
  // Lift: park the attribute so the browser's own tip cannot double the chip.
  assert.match(layer, /closest<HTMLElement>\('\[title\], \[data-cf-title\]'\)/);
  assert.match(layer, /host\.dataset\.cfTitle = text;\s*host\.removeAttribute\('title'\)/);
  // Restore: on a new host, on pointer leave, and on layer teardown.
  assert.match(layer, /host\.setAttribute\('title', parked\)/);
  assert.match(layer, /const onLeave = \(\) => \{\s*restoreTitle\(\)/);
  assert.match(layer, /return \(\) => \{\s*restoreTitle\(\);\s*window\.removeEventListener/);
  // Same length law as HoverTooltip labels — long titles stay native.
  assert.match(layer, /text && canRideCursor\(text\)/);
});
