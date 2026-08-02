import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  framerGesture,
  framerPresence,
  framerTransition,
  motionBezier,
} from '../foundations/motion-framer';
import { reducePresenceShape } from '../foundations/motion-framer-hooks';
import { motionRole } from './roles';

/**
 * The role layer must stay an INDEXING layer over the preset catalog — never a
 * second copy of the physics. These assert identity (`===`), not deep equality:
 * a copied literal would pass a value comparison and then silently drift the
 * first time someone retuned one side.
 */

test('every role resolves to the exact catalog object — no copied physics', () => {
  assert.equal(motionRole.swap.scan.presence, framerPresence.stationCartonSwap);
  assert.equal(motionRole.swap.scan.transition, framerTransition.stationCartonSwapMount);

  assert.equal(motionRole.swap.focus.presence, framerPresence.workbenchPane);
  assert.equal(motionRole.swap.focus.transition, framerTransition.workbenchPaneMount);

  assert.equal(motionRole.push.rail.presence, framerPresence.detailStackPush);
  assert.equal(motionRole.push.rail.transition, framerTransition.sidebarNavColumnMount);

  assert.equal(motionRole.gesture.press.whileTap, framerGesture.tapPress);
  assert.equal(motionRole.feedback.pulse.transition, framerTransition.chipCopyFeedback);
});

test('there are exactly five roles', () => {
  const leaves = Object.values(motionRole).flatMap((group) => Object.keys(group));
  assert.equal(
    leaves.length,
    5,
    `Roles: ${leaves.join(', ')}. A sixth role is a claim that a new JOB exists — ` +
      'wanting a different duration for an existing job is the drift this layer prevents.',
  );
});

/**
 * The station contract. `swap.scan`'s exit carries its own zero-duration
 * transition so `mode="wait"` completes it on the same frame — that is what
 * turned ~0.6s of empty canvas per scan into a 0.12s enter fade on the Unbox
 * bench. A "normalisation" onto `swap.focus`'s symmetric shape would silently
 * reintroduce the gap at scan cadence.
 */
test('swap.scan keeps its zero-duration exit', () => {
  const { exit } = motionRole.swap.scan.presence;
  assert.deepEqual(exit, { opacity: 0, transition: { duration: 0 } });
});

test('swap.scan keeps the zero-duration exit through reduced motion', () => {
  const reduced = reducePresenceShape(motionRole.swap.scan.presence);
  assert.deepEqual(
    reduced.exit,
    { opacity: 0, transition: { duration: 0 } },
    'The bridge strips transform/filter keys only — a reducer that flattened presence to bare ' +
      'opacity would drop the nested transition and hand the gap back.',
  );
});

/**
 * The push contract. A spring overshoots its target, and for a push the target
 * is the width every sibling lays out against — the work surface would visibly
 * rubber-band on every open.
 */
test('push.rail is a tween on the layout curve, never a spring', () => {
  const t = motionRole.push.rail.transition as { type?: string; ease?: unknown };
  assert.notEqual(t.type, 'spring');
  assert.equal(t.ease, motionBezier.layout);
});

test('push.rail presence is opacity-only — no translate into its own reserved slot', () => {
  const { initial, animate, exit } = motionRole.push.rail.presence;
  for (const shape of [initial, animate, exit]) {
    assert.deepEqual(
      Object.keys(shape ?? {}),
      ['opacity'],
      'The column width tween owns arrive/leave; an x translate would slide the card out of ' +
        'the slot it just reserved, leaving an empty gutter beside the work surface.',
    );
  }
});

/**
 * Reduced motion means "replace slides with crossfades", not "no motion" — the
 * opacity must survive on every presence role, or the reduced form is a hard cut.
 */
test('every presence role keeps opacity under reduced motion', () => {
  for (const [name, role] of [
    ['swap.scan', motionRole.swap.scan],
    ['swap.focus', motionRole.swap.focus],
    ['push.rail', motionRole.push.rail],
  ] as const) {
    const reduced = reducePresenceShape(role.presence);
    assert.ok('opacity' in reduced.initial, `${name}: initial lost opacity`);
    assert.ok('opacity' in reduced.animate, `${name}: animate lost opacity`);
  }
});

/**
 * The bridge's own regression, re-pinned from the role layer's side: it once
 * flattened presence to bare opacity, which discarded `collapseHeight`'s height
 * keys and left elements faded at full box. `collapseHeight` is the one
 * sanctioned height animation in the house.
 */
test('reduced motion preserves the sanctioned height collapse', () => {
  const reduced = reducePresenceShape(framerPresence.collapseHeight);
  assert.ok('height' in reduced.initial, 'collapseHeight must still collapse under reduce');
  assert.ok('height' in reduced.animate, 'collapseHeight must still expand under reduce');
});
