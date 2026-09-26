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
import { fadeInstant, springArmedTrack, springSnappy } from './tokens';

/** The role layer must stay an INDEXING layer over the preset catalog — never a second copy of the physics. */

test('every role resolves to the exact catalog object — no copied physics', () => {
  assert.equal(motionRole.swap.scan.presence, framerPresence.stationCartonSwap);
  assert.equal(motionRole.swap.scan.transition, framerTransition.stationCartonSwapMount);

  assert.equal(motionRole.swap.focus.presence, framerPresence.workbenchPane);
  assert.equal(motionRole.swap.focus.transition, framerTransition.workbenchPaneMount);

  assert.equal(motionRole.push.rail.presence, framerPresence.detailStackPush);
  assert.equal(motionRole.push.rail.transition, framerTransition.sidebarNavColumnMount);

  assert.equal(motionRole.gesture.press.whileTap, framerGesture.tapPress);
  assert.equal(motionRole.feedback.pulse.transition, framerTransition.chipCopyFeedback);
  assert.equal(motionRole.feedback.hitMarker.transition, framerTransition.hitMarker);
  assert.equal(motionRole.procedure.advance.transition, framerTransition.procedureStackLayout);
});

test('named spring / fade presets resolve to the house physics tokens — no copied physics', () => {
  assert.equal(framerTransition.captureStackRowMount, springSnappy);
  assert.equal(framerTransition.cardExpansion, springSnappy);
  assert.equal(framerTransition.quantityBump, springSnappy);
  assert.equal(framerTransition.sliderIndicator, springSnappy);
  assert.equal(framerTransition.workOrderModalSpring, springSnappy);
  assert.equal(framerTransition.commandBarDialog, springSnappy);
  assert.equal(framerTransition.routeHistoryMount, springSnappy);
  assert.equal(framerTransition.chipCopyFeedback, fadeInstant);
  assert.equal(framerTransition.overlayScrim, fadeInstant);
  assert.equal(motionRole.feedback.pulse.transition, fadeInstant);
  assert.equal(motionRole.feedback.hitMarker.transition, framerTransition.hitMarker);
  assert.equal(
    (framerTransition.hitMarker as { duration: number }).duration,
    0.1,
    'hitMarker stays ≤150ms (catalog 100ms)',
  );
  assert.equal(
    (framerTransition.armedSnap as { duration: number }).duration,
    0,
    'armedSnap remains available as binary-cut preset',
  );
  assert.equal(
    framerTransition.armedTrack,
    springArmedTrack,
    'armedTrack FLIP uses springArmedTrack (no copied physics)',
  );
  assert.equal(
    (framerTransition.selectionPulse as { duration: number }).duration,
    0.35,
    'selectionPulse is the boxed overlay recipe (opacity + scale)',
  );
});

test('routeHistory rises on appear — desk tables never wipe left→right', () => {
  const { initial, animate } = framerPresence.routeHistory;
  assert.equal((initial as { x?: number }).x, undefined);
  assert.equal((animate as { x?: number }).x, undefined);
  assert.ok(
    typeof (initial as { y?: number }).y === 'number' && (initial as { y: number }).y > 0,
    'initial y must be below rest so the surface rises into place',
  );
  assert.equal((animate as { y?: number }).y, 0);
});

test('there are exactly nine roles', () => {
  const leaves = Object.values(motionRole).flatMap((group) => Object.keys(group));
  assert.equal(
    leaves.length,
    9,
    `Roles: ${leaves.join(', ')}. A tenth role is a claim that a new JOB exists — ` +
      'wanting a different duration for an existing job is the drift this layer prevents. ' +
      '`feedback.hitMarker` (2026-08-07) is the seventh: middle confirm depth ≠ pulse ack ' +
      '(Displays open must not withhold DOM behind it). `feedback.liveChange` (2026-08-20) ' +
      'is the eighth: a value changed REMOTELY, on an element nobody is looking at — the ' +
      'other two feedback roles both acknowledge something the operator just did under ' +
      'their own cursor, which is why 100-150ms is enough for them and not for this. ' +
      '`record.pane` (2026-09-26) is the ninth: the split record pane arriving BESIDE a ' +
      'list whose width snaps — not `push.rail`, whose own width tween owns arrival and ' +
      'reflows siblings; here the slot is already reserved and the card lands in it.',
  );
});

/** `feedback.liveChange` is the one role whose keyframes live at the call site (`useLiveValueChange` hands `animate()` arrays, rather than… */
test('feedback.liveChange carries a double-pulse map and a shorter morph', () => {
  const { transition, morph } = motionRole.feedback.liveChange;
  assert.equal(transition.times.length, 6, 'double pulse: rest · peak · trough · peak · trough · settle');
  assert.equal(morph.times.length, 3, 'label dip: in · out · back');
  assert.ok(
    morph.duration < transition.duration,
    'the morph resolves INSIDE the first beat — the word must not still be swapping at settle',
  );
  assert.ok(transition.duration < 0.5, 'a one-shot ack stays under the house half-second ceiling');
});

/** The station contract. */
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

/** The bridge's own regression, re-pinned from the role layer's side: */
test('reduced motion preserves the sanctioned height collapse', () => {
  const reduced = reducePresenceShape(framerPresence.collapseHeight);
  assert.ok('height' in reduced.initial, 'collapseHeight must still collapse under reduce');
  assert.ok('height' in reduced.animate, 'collapseHeight must still expand under reduce');
});
