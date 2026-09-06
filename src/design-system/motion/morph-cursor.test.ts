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
  // Glyph shapes live in the chrome skin now; the layer only hit-tests.
  const skins = src('./cursor-skins.tsx');
  assert.match(skins, /CursorGlyph/);
  assert.match(skins, /kind === 'click'/);
  assert.match(skins, /kind === 'resize-x'/);
  assert.match(skins, /kind === 'grab' \|\| kind === 'grabbing'/);
  // Box-wear is opt-in morph only, not the default for buttons.
  assert.match(src('../primitives/Button.tsx'), /cursorClickTarget/);
  assert.doesNotMatch(src('../primitives/Button.tsx'), /from '@\/design-system\/motion'/);
  assert.match(src('../primitives/IconButton.tsx'), /cursorClickTarget/);
  assert.match(src('../components/HorizontalEdgeResizeHandle.tsx'), /cursorResizeTarget/);
});

test('every skin is one component that renders every state — no partial skins', () => {
  const skins = src('./cursor-skins.tsx');
  const store = src('./cursor-skin.ts');
  // The catalog ids and the registry agree; chrome stays the default so the
  // shipped desk never changes face on update.
  assert.match(store, /CURSOR_SKIN_IDS = \['chrome', 'orbit', 'comet', 'reticle', 'gem'\]/);
  assert.match(store, /DEFAULT_CURSOR_SKIN: CursorSkinId = 'chrome'/);
  for (const id of ['chrome', 'orbit', 'comet', 'reticle', 'gem']) {
    assert.match(skins, new RegExp(`^  ${id}: \\{`, 'm'), `${id} must be in the registry`);
    assert.match(skins, new RegExp(`^function ${id.charAt(0).toUpperCase() + id.slice(1)}Cursor`, 'm'), `${id} has its own Cursor`);
  }
  // Every skin component takes the full state contract — kind AND pressed AND
  // the geometry springs. A skin that ignores `pressed` ships half the states.
  const cursors = skins.match(/function \w+Cursor\(\{ kind, pressed, color, width, height, marginLeft, marginTop \}/g) ?? [];
  assert.equal(cursors.length, 5, 'all five cores consume the same props');
  const shells = skins.match(/function \w+Shell\(\{ kind, pressed, color, width, height, marginLeft, marginTop \}/g) ?? [];
  assert.equal(shells.length, 4, 'the four two-speed skins have shells');
  assert.match(skins, /Shell: null/, 'chrome is single-speed by design');
  // Skins are paint, never engines: no listeners, no stores, no measuring.
  assert.doesNotMatch(skins, /addEventListener/);
  assert.doesNotMatch(skins, /getBoundingClientRect/);
  assert.doesNotMatch(skins, /useSyncExternalStore/);
});

test('two speeds: the hotspot never lags, only the shell may trail', () => {
  const layer = src(LAYER);
  // The modern cursor idiom (motion.dev's own Cursor works this way): a
  // glued core plus a spring-trailing shell. The cursorFollow law survives
  // intact — the hotspot is still raw motion values set to the snapped
  // pointer; only the SHELL chases, on the travelling-marker spring (the
  // morph role), so the mark reads as one liquid object in motion.
  assert.match(layer, /const shellX = useSpring\(x, motionRole\.cursor\.morph\.transition\)/);
  assert.match(layer, /const shellY = useSpring\(y, motionRole\.cursor\.morph\.transition\)/);
  assert.match(layer, /data-testid="morph-cursor-shell"/);
  // Box-wear and scrub are the statement — the shell gets out of the way.
  assert.match(layer, /kind !== 'morph' && !scrub/);
  // The shell wears the same halo as the core (it is half the mark).
  const shellBlock = layer.slice(layer.indexOf('morph-cursor-shell'), layer.indexOf('morph-cursor"', layer.indexOf('morph-cursor-shell')));
  assert.match(shellBlock, /filter: CURSOR_HALO/);
});

test('state accents crossfade — they never pop in and out of the DOM', () => {
  const skins = src('./cursor-skins.tsx');
  // A kind arriving should read as the mark blooming, not a new element
  // stamping in. Accents stay MOUNTED and animate opacity/scale on the
  // house spring — conditional rendering of state marks is the regression.
  assert.match(skins, /animate=\{\{ opacity: show \? 1 : 0, scale: show \? 1 : 0\.3 \}\}/);
  assert.match(skins, /animate=\{\{ opacity: show \? 1 : 0, scale: show \? 1 : 0\.4 \}\}/);
  assert.doesNotMatch(skins, /\{kind === 'click' \? <AccentDot/, 'accents are not conditionally mounted');
  // Press is counter-motion per skin, never one uniform shrink: cores grow
  // or spin while their shells contract.
  assert.match(skins, /scale: pressed \? 1\.3 : 1/, 'orbit core grows on press');
  assert.match(skins, /scale: pressed \? 0\.72 : 1/, 'orbit shell squeezes onto it');
  assert.match(skins, /rotate: pressed \? 135 : 45/, 'gem core spins');
  assert.match(skins, /rotate: 45 \+ \(pressed \? -20 : 0\)/, 'gem shell cocks the other way');
});
test('skins animate through a role, never inline physics', () => {
  const skins = src('./cursor-skins.tsx');
  assert.match(skins, /motionRole\.cursor\.morph\.transition/);
  assert.doesNotMatch(skins, /stiffness:/, 'no inline spring in a skin');
  assert.doesNotMatch(skins, /damping:/, 'no inline spring in a skin');
  assert.doesNotMatch(skins, /useVelocity/, 'velocity smear is drag, not follow');
});

test('the pressed state is the engine\'s, wired once for every skin', () => {
  const layer = src(LAYER);
  // Press rides the window so drags that leave their target stay engaged.
  assert.match(layer, /addEventListener\('pointerdown'/);
  assert.match(layer, /addEventListener\('pointerup'/);
  assert.match(layer, /addEventListener\('pointercancel'/);
  assert.match(layer, /data-cursor-pressed=/);
  assert.match(layer, /pressed=\{pressed\}/);
  // Leave clears it — a cursor stuck "engaged" off-window lies.
  assert.match(layer, /onLeave[\s\S]*setPressed\(false\)/);
});

test('the mark wears the find-me halo — a white outline, and nothing else', () => {
  const layer = src(LAYER);
  // Without a halo a staff-green dot hovering a staff-green control returns
  // ZERO deviating pixels (measured) — the cursor vanishes exactly where the
  // operator looks hardest. The fix is the macOS-style white outline:
  // sub-pixel drop-shadow passes stacked to a crisp rim that follows the
  // painted silhouette (chevrons, brackets, flare included).
  assert.match(layer, /drop-shadow\(0 0 0\.66px #fff\)/, 'white rim follows the painted silhouette');
  // Operator ruling 2026-09-06: outline ONLY. The dark drop shadow under the
  // mark read as a smudge and is banned — an offset/below-shadow pass here
  // is a regression of that ruling, not an accessibility win.
  assert.doesNotMatch(
    layer,
    /drop-shadow\([^)]*rgba\(15, 23, 42/,
    'no dark drop shadow may ride the mark',
  );
  // One halo site: it wraps ONLY the skin paint. The tooltip chip and scrub
  // readout carry their own ground and must stay outside it.
  assert.match(
    layer,
    /data-cursor-halo="" style=\{\{ filter: CURSOR_HALO \}\}>\s*<Cursor[\s\S]*?\{readout/,
    'halo wraps the skin, not the chips',
  );
});

test('the skin is picked on the desk, persisted on the desk', () => {
  const store = src('./cursor-skin.ts');
  // Device-local like page wash — never a staff_preferences field.
  assert.match(store, /cf\.cursor-skin/);
  assert.match(store, /localStorage\.setItem/);
  assert.match(store, /readCursorSkinServer[\s\S]*return DEFAULT_CURSOR_SKIN/);
  const layer = src(LAYER);
  assert.match(layer, /useSyncExternalStore\(subscribeCursorSkin, readCursorSkin, readCursorSkinServer\)/);
  assert.match(layer, /data-cursor-skin=\{skinId\}/);
  const settings = src('../../components/settings/sections/AppearanceSection.tsx');
  assert.match(settings, /updateCursorSkin/, 'the Pointer card is the write path');
  assert.match(settings, /CursorSkinPreviewMini/);
  // The preview paints from the registry itself, so the card cannot drift.
  assert.match(settings, /CURSOR_SKINS\[id\]/);
});

test('the cursor rides a named z band, not a magic number', () => {
  const layer = src(LAYER);
  assert.match(layer, /z-tooltip/);
  assert.doesNotMatch(layer, /z-\[\d+\]/);
  assert.match(layer, /pointer-events-none/);
  assert.match(layer, /aria-hidden/);
});

test('the layer never carries text at a fractional device-pixel offset', () => {
  const layer = src(LAYER);
  // The chip is TEXT inside a `will-change: transform` layer, so the
  // compositor re-uses one raster at whatever offset the transform names. A
  // fractional offset resamples the glyphs instead of re-rasterizing them,
  // which is blur — and at a 1.25 DPR desk even a whole CSS px (14 -> 17.5
  // device px) is off the grid, so rounding must happen in device space.
  assert.match(layer, /function snapToDevicePixel/);
  assert.match(layer, /window\.devicePixelRatio/);
  // Every position the layer or the chip is painted at goes through the snap.
  assert.doesNotMatch(layer, /x\.set\(clientX\)/, 'raw pointer x is a fractional offset');
  assert.doesNotMatch(layer, /y\.set\(clientY\)/, 'raw pointer y is a fractional offset');
  assert.doesNotMatch(
    layer,
    /labelX\.set\(fitsRight/,
    'the flip offset is measured from getBoundingClientRect and is fractional',
  );
  assert.match(layer, /x\.set\(snapToDevicePixel\(clientX\)\)/);
  assert.match(layer, /labelX\.set\(snapToDevicePixel\(/);
  assert.match(layer, /labelY\.set\(snapToDevicePixel\(/);
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
