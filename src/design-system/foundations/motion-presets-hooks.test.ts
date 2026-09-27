import test from 'node:test';
import assert from 'node:assert/strict';

import { reducePresenceShape } from './motion-presets-hooks';
import { motionPresence } from './motion-presets';

/** Pins the reduced form of a presence shape — the pure core of `useMotionPresence`. */

const TRANSFORM_KEYS = [
  'x', 'y', 'z',
  'translateX', 'translateY', 'translateZ',
  'scale', 'scaleX', 'scaleY',
  'rotate', 'rotateX', 'rotateY', 'rotateZ',
  'skew', 'skewX', 'skewY',
  'transformPerspective',
  'filter',
];

test('every vestibular transform key is stripped, opacity is kept', () => {
  const all = Object.fromEntries(TRANSFORM_KEYS.map((k) => [k, 1]));
  const reduced = reducePresenceShape({
    initial: { ...all, opacity: 0, clipPath: 'inset(0 100% 0 0)' },
    animate: { ...all, opacity: 1, clipPath: 'inset(0 0% 0 0)' },
    exit: { ...all, opacity: 0, clipPath: 'inset(0 100% 0 0)' },
  });

  for (const phase of ['initial', 'animate', 'exit'] as const) {
    const shape = reduced[phase] as Record<string, unknown>;
    for (const key of TRANSFORM_KEYS) {
      assert.ok(!(key in shape), `${phase} should have stripped the "${key}" key`);
    }
    assert.ok('opacity' in shape, `${phase} must keep opacity — reduce means crossfade, not cut`);
    assert.ok('clipPath' in shape, `${phase} must keep clipPath — only vestibular travel is stripped`);
  }
});

test('a presence shape without an exit does not grow one', () => {
  const reduced = reducePresenceShape({ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } });
  assert.ok(!('exit' in reduced), 'reduction must not invent an exit phase');
  assert.deepEqual(reduced.initial, { opacity: 0 });
  assert.deepEqual(reduced.animate, { opacity: 1 });
});

test('reduction does not mutate the shared preset objects', () => {
  // A preset whose reduction strips keys (rotateX, transformPerspective) — the case a mutating implementation would corrupt.
  const before = JSON.stringify(motionPresence.weldedPanelPeel);
  reducePresenceShape(motionPresence.weldedPanelPeel);
  assert.equal(
    JSON.stringify(motionPresence.weldedPanelPeel),
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
