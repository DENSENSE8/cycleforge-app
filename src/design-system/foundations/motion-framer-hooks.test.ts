import test from 'node:test';
import assert from 'node:assert/strict';

import { reducePresenceShape } from './motion-framer-hooks';
import { framerPresence } from './motion-framer';

/**
 * Pins the reduced form of a presence shape — the pure core of
 * `useMotionPresence`.
 *
 * THE REGRESSION THIS EXISTS FOR: the bridge used to return a flat
 * `{ initial:{opacity}, animate:{opacity}, exit:{opacity} }`, which DISCARDED
 * the `height` keys of `framerPresence.collapseHeight` / `sidebarSection`
 * (both `{height:0} → {height:'auto'}`). The element then faded while holding
 * its full box and never collapsed at all — over-reduction, not reduction.
 * `collapseHeight` is the one sanctioned height animation in
 * `.claude/rules/display/motion-crossfade.md`, so it has to survive.
 *
 * Reduced motion means "replace slides with crossfades" (WCAG 2.3.3 / Apple
 * HIG), not "drop every key that is not opacity".
 */

const TRANSFORM_KEYS = [
  'x', 'y', 'z',
  'translateX', 'translateY', 'translateZ',
  'scale', 'scaleX', 'scaleY',
  'rotate', 'rotateX', 'rotateY', 'rotateZ',
  'skew', 'skewX', 'skewY',
  'transformPerspective',
  'filter',
];

test('height survives the reduction on the sanctioned height presets', () => {
  for (const name of ['collapseHeight', 'sidebarSection'] as const) {
    const reduced = reducePresenceShape(framerPresence[name]);
    for (const phase of ['initial', 'animate', 'exit'] as const) {
      const shape = reduced[phase] as Record<string, unknown> | undefined;
      assert.ok(shape, `${name}.${phase} should still exist`);
      assert.ok(
        'height' in shape,
        `${name}.${phase} lost its height key — the element would fade at full box instead of collapsing`,
      );
    }
    // The collapse must still travel between 0 and its natural height.
    assert.equal((reduced.initial as Record<string, unknown>).height, 0);
    assert.equal((reduced.animate as Record<string, unknown>).height, 'auto');
  }
});

test('no preset silently loses a height key when reduced', () => {
  for (const [name, presence] of Object.entries(framerPresence)) {
    if (!presence || typeof presence !== 'object' || !('initial' in presence)) continue;
    const reduced = reducePresenceShape(presence as Parameters<typeof reducePresenceShape>[0]);
    for (const phase of ['initial', 'animate', 'exit'] as const) {
      const before = (presence as Record<string, unknown>)[phase];
      if (!before || typeof before !== 'object' || !('height' in before)) continue;
      assert.ok(
        'height' in ((reduced as Record<string, unknown>)[phase] as object),
        `framerPresence.${name}.${phase} lost its height key`,
      );
    }
  }
});

test('every vestibular transform key is stripped, opacity is kept', () => {
  const all = Object.fromEntries(TRANSFORM_KEYS.map((k) => [k, 1]));
  const reduced = reducePresenceShape({
    initial: { ...all, opacity: 0, height: 0 },
    animate: { ...all, opacity: 1, height: 'auto' },
    exit: { ...all, opacity: 0, height: 0 },
  });

  for (const phase of ['initial', 'animate', 'exit'] as const) {
    const shape = reduced[phase] as Record<string, unknown>;
    for (const key of TRANSFORM_KEYS) {
      assert.ok(!(key in shape), `${phase} should have stripped the "${key}" key`);
    }
    assert.ok('opacity' in shape, `${phase} must keep opacity — reduce means crossfade, not cut`);
    assert.ok('height' in shape, `${phase} must keep height`);
  }
});

test('a presence shape without an exit does not grow one', () => {
  const reduced = reducePresenceShape({ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } });
  assert.ok(!('exit' in reduced), 'reduction must not invent an exit phase');
  assert.deepEqual(reduced.initial, { opacity: 0 });
  assert.deepEqual(reduced.animate, { opacity: 1 });
});

test('reduction does not mutate the shared preset objects', () => {
  const before = JSON.stringify(framerPresence.collapseHeight);
  reducePresenceShape(framerPresence.collapseHeight);
  assert.equal(
    JSON.stringify(framerPresence.collapseHeight),
    before,
    'presets are module-level singletons shared by every consumer — reduction must be pure',
  );
});

test('non-motion keys ride through untouched', () => {
  const reduced = reducePresenceShape({
    initial: { opacity: 0, y: 8, pointerEvents: 'none' },
    animate: { opacity: 1, y: 0, pointerEvents: 'auto' },
  });
  assert.equal((reduced.initial as Record<string, unknown>).pointerEvents, 'none');
  assert.equal((reduced.animate as Record<string, unknown>).pointerEvents, 'auto');
});
