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

const src = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');

test('only a short single-line string may ride the cursor', () => {
  assert.equal(canRideCursor('Copy tracking'), true);
  assert.equal(canRideCursor(''), false);
  assert.equal(canRideCursor('a\nb'), false, 'multi-line stays on the bubble');
  assert.equal(canRideCursor('x'.repeat(CURSOR_LABEL_MAX_CHARS + 1)), false);
  assert.equal(canRideCursor(null), false);
  assert.equal(canRideCursor({ type: 'span' }), false, 'rich labels stay on the bubble');
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
  // Same skin as HoverTooltip's bubble: inverse ground, white text, a corner role.
  assert.match(layer, /bg-surface-inverse[^'"]*text-white/);
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
  assert.match(tip, /if \(cursor\.enter\(label, openDelayMs\)\) return;/);
  // Focus never goes to the cursor — keyboard and scan-gun users have no pointer.
  assert.match(
    tip,
    /onFocusTrigger = \(\) => \{\s*if \(disabled\) return;[\s\S]*?if \(cursor\.riding\(\)\) return;\s*activate\('focus'/,
  );
  assert.match(tip, /cursor\.leave\(\);/);
  assert.match(tip, /role="tooltip"/, 'the anchored bubble still exists');
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
