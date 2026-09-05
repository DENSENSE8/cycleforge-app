import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const src = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');

const LAYER = './MorphCursorLayer.tsx';
const SLIDER = '../primitives/ScrubSlider.tsx';
const TOGGLE = '../../components/ui/VisibilityToggle.tsx';
const SHELL = '../../components/layout/WarehouseShell.tsx';

test('the cursor layer never mounts where there is no pointer', () => {
  const layer = src(LAYER);
  // A floor station is a mounted touchscreen worked by a gloved hand. The gate
  // is what keeps a decoration off the scan path entirely — not a CSS opacity.
  assert.match(layer, /usePointerFine/);
  assert.match(layer, /useReducedMotion/);
  assert.match(layer, /const enabled = fine && !reduceMotion/);
  assert.match(layer, /if \(!enabled\) return null;/);
  // Listeners are attached inside an effect that bails on the same flag.
  assert.match(layer, /if \(!enabled\) return;[\s\S]*addEventListener\('pointermove'/);
  assert.match(src('./use-pointer-fine.ts'), /\(pointer: fine\)/);
  // matchMedia does not exist on the server; the layer must start false or it
  // hydration-mismatches a fixed full-viewport element.
  assert.match(src('./use-pointer-fine.ts'), /useState\(false\)/);
});

test('the custom cursor replaces every OS cursor while enabled', () => {
  const layer = src(LAYER);
  // Same hide Motion+ <Cursor /> installs: a head stylesheet, not a class on
  // <html>. Child cursor-pointer / text (I-beam / "typewriter") / grab all lose.
  assert.match(layer, /useInsertionEffect/);
  assert.match(layer, /data-cf-morph-cursor/);
  assert.match(layer, /cursor:\s*none\s*!important/);
  assert.match(layer, /\*\s*,\s*\*::before\s*,\s*\*::after/);
  assert.match(layer, /function useHideOsCursor/);
});

test('the cursor is mounted exactly once, app-wide', () => {
  const shell = src(SHELL);
  assert.match(shell, /<MorphCursorLayer \/>/);
  assert.equal(shell.match(/<MorphCursorLayer/g)?.length, 1, 'two instances is two cursors');
  // Inside ReducedMotionProvider, which is already behind next/dynamic — a
  // static import at the root layout ships the framer runtime to public routes.
  assert.match(shell, /ReducedMotionProvider[\s\S]*<MorphCursorLayer/);
});

test('cursor physics come from a role, never a literal at the call site', () => {
  const layer = src(LAYER);
  // Follow is glued (motion values). Morph size still springs from the role.
  assert.match(layer, /useMotionValue/);
  assert.match(layer, /motionRole\.cursor\.morph\.transition/);
  assert.doesNotMatch(layer, /stiffness:/, 'no inline spring in a consumer');
  assert.doesNotMatch(layer, /damping:/, 'no inline spring in a consumer');
  assert.doesNotMatch(layer, /useVelocity/, 'velocity smear is drag, not follow');

  const roles = src('./roles.ts');
  assert.match(roles, /follow: \{\s*transition: framerTransition\.cursorFollow/);
  assert.match(roles, /morph: \{\s*transition: framerTransition\.cursorMorph/);
  const presets = src('../foundations/motion-framer.ts');
  assert.match(presets, /cursorFollow: cursorFollowSnap/);
  assert.match(presets, /cursorMorph: springArmedTrack/);
  const tokens = src('./tokens.ts');
  assert.match(tokens, /cursorFollowSnap[\s\S]*duration:\s*0/);
});

test('the cursor role is not legal on a floor station', () => {
  const roles = src('./roles.ts');
  const start = roles.indexOf('  cursor: {');
  // Slice to the group's OWN closing brace, not the file's — every role group
  // after this one legally carries 'station'.
  const cursorBlock = roles.slice(start, roles.indexOf('\n  },\n', start));
  assert.ok(cursorBlock.length > 0, 'cursor role block must exist');
  assert.doesNotMatch(
    cursorBlock,
    /'station'/,
    'a gloved hand on a mounted screen has no pointer to follow',
  );
});

test('the scrub channel survives pointer capture', () => {
  const channel = src('./cursor-scrub.ts');
  // A module store, not an attribute read off the hovered element: a drag that
  // overshoots the track still owns the pointer, and the readout must follow it.
  assert.match(channel, /const listeners = new Set/);
  assert.match(channel, /export function publishCursorScrub/);
  assert.match(channel, /export function readCursorScrubServer/);
  assert.match(src(LAYER), /useSyncExternalStore\(subscribeCursorScrub/);
  assert.match(src(SLIDER), /setPointerCapture/);
});

test('a scrubbed value is never ONLY on the cursor', () => {
  const slider = src(SLIDER);
  // Cursor readout is the accelerant; the DOM copy is the statement. Touch,
  // keyboard and screen-reader users only ever get the second one.
  assert.match(slider, /data-testid=\{`\$\{testId\}-value`\}/);
  assert.match(slider, /role="slider"/);
  assert.match(slider, /aria-valuemin/);
  assert.match(slider, /aria-valuemax/);
  assert.match(slider, /aria-valuenow/);
  assert.match(slider, /aria-valuetext/);
  assert.match(slider, /onKeyDown/, 'arrows/Home/End must move it without a mouse');
});

test('the selection pill travels — it does not blink between two backgrounds', () => {
  const toggle = src(TOGGLE);
  assert.match(toggle, /layoutId=\{pillId\}/);
  assert.equal(toggle.match(/layoutId=\{pillId\}/g)?.length, 2, 'both faces share one pill');
  // useId-scoped so two toggles on one screen do not trade their pill.
  assert.match(toggle, /const pillId = `visibility-pill-\$\{useId\(\)\}`/);
  assert.match(toggle, /motionRole\.cursor\.morph\.transition/);
});

test('the motion package stays behind the boundary', () => {
  // VisibilityToggle is app code — it may name the barrel, never the package.
  const toggle = src(TOGGLE);
  assert.match(toggle, /from '@\/design-system\/motion'/);
  assert.doesNotMatch(toggle, /'motion\/react'/);
  assert.doesNotMatch(toggle, /'framer-motion'/);
  assert.match(src(SLIDER), /from '@\/design-system\/motion'/);
  assert.doesNotMatch(src(SLIDER), /'motion\/react'/);
  // The engine symbols the layer needs are re-exported explicitly, not star-ed.
  const framer = src('./framer.ts');
  for (const symbol of ['useSpring', 'useMotionValue', 'frame']) {
    assert.match(framer, new RegExp(`\\b${symbol},`), `${symbol} must be re-exported`);
  }
  assert.doesNotMatch(framer, /export \* from/);
});

test('the idle dot is the signed-in staff color', () => {
  const layer = src(LAYER);
  assert.match(layer, /getStaffColorHex/);
  assert.match(layer, /useStaffColorVersion/);
  assert.match(layer, /user\?\.staffId/);
});

test('Chrome-style cursor kinds stay small — they do not wear the button box', () => {
  const kinds = src('./cursor-scrub.ts');
  assert.match(kinds, /cursorClickTarget/);
  assert.match(kinds, /cursorResizeTarget/);
  assert.match(kinds, /cursorGrabTarget/);
  assert.match(kinds, /CURSOR_KIND_SELECTOR/);
  const layer = src(LAYER);
  assert.match(layer, /CURSOR_KIND_SELECTOR/);
  assert.match(layer, /CursorGlyph/);
  assert.match(layer, /click/);
  assert.match(layer, /resize-x/);
  assert.match(layer, /grabbing/);
  // Box-wear is opt-in morph only, not the default for buttons.
  assert.match(src('../primitives/Button.tsx'), /cursorClickTarget/);
  assert.doesNotMatch(src('../primitives/Button.tsx'), /from '@\/design-system\/motion'/);
  assert.match(src('../primitives/IconButton.tsx'), /cursorClickTarget/);
  assert.match(src('../components/HorizontalEdgeResizeHandle.tsx'), /cursorResizeTarget/);
});

test('the cursor rides a named z band, not a magic number', () => {
  const layer = src(LAYER);
  assert.match(layer, /z-tooltip/);
  assert.doesNotMatch(layer, /z-\[\d+\]/);
  assert.match(layer, /pointer-events-none/);
  assert.match(layer, /aria-hidden/);
});

test('the slider is mounted on a real surface, not just exported', () => {
  // A primitive nobody renders is a primitive nobody notices is broken.
  const dispatcher = src('../../components/settings/controls/SettingControl.tsx');
  assert.match(dispatcher, /case 'slider':/);
  assert.match(dispatcher, /<ScrubSlider/);
  assert.match(dispatcher, /ScrubSlider/);

  const registry = src('../../lib/settings/registry.ts');
  assert.ok(
    (registry.match(/control: 'slider'/g) ?? []).length >= 2,
    'the two wide Vision ranges should be sliders',
  );
  // consensusNeeded is 1-5: too few stops to be worth dragging, stays a number.
  const consensus = registry.slice(registry.indexOf("key: 'receiving.vision.consensusNeeded'"));
  assert.match(consensus.slice(0, 400), /control: 'number'/);
});
