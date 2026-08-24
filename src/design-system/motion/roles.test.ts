import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
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

test('there are exactly eight roles', () => {
  const leaves = Object.values(motionRole).flatMap((group) => Object.keys(group));
  assert.equal(
    leaves.length,
    8,
    `Roles: ${leaves.join(', ')}. A ninth role is a claim that a new JOB exists — ` +
      'wanting a different duration for an existing job is the drift this layer prevents. ' +
      '`feedback.hitMarker` (2026-08-07) is the seventh: middle confirm depth ≠ pulse ack ' +
      '(Displays open must not withhold DOM behind it). `feedback.liveChange` (2026-08-20) ' +
      'is the eighth: a value changed REMOTELY, on an element nobody is looking at — the ' +
      'other two feedback roles both acknowledge something the operator just did under ' +
      'their own cursor, which is why 100-150ms is enough for them and not for this.',
  );
});

/**
 * `feedback.liveChange` is the one role whose keyframes live at the call site
 * (`useLiveValueChange` hands `animate()` arrays, rather than a `motion.*`
 * component reading a presence shape). That makes the `times` map part of the
 * contract: Motion requires `keyframes.length === times.length`, and a mismatch
 * throws at runtime on the exact surface nobody is watching.
 */
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

/**
 * ADOPTION RATCHET — a role, once adopted, is adopted everywhere its job occurs.
 *
 * Half a vocabulary is worse than none: two spellings for one job re-asks the
 * "which of these do I use?" question the role layer exists to close, only now
 * about the role instead of the literal. So once a role's sweep lands, raw use
 * of its underlying pair is a regression.
 *
 * There is deliberately NO allowlist here — it briefly carried one entry during
 * the Unbox procedure refactor and reached zero on 2026-08-01. Do not reintroduce
 * one to make a change pass; migrate the call site to the role instead.
 */
const SRC = join(process.cwd(), 'src');

/** The boundary owns the presets by definition; roles.ts references them. */
const EXEMPT_PREFIX = 'design-system/motion/';

const RAW_ROLE_USE: ReadonlyArray<{ role: string; patterns: readonly string[] }> = [
  {
    role: 'swap.scan',
    patterns: [
      'useMotionPresence(framerPresence.stationCartonSwap)',
      'useMotionTransition(framerTransition.stationCartonSwapMount)',
    ],
  },
  {
    role: 'swap.focus',
    patterns: [
      'useMotionPresence(framerPresence.workbenchPane)',
      'useMotionTransition(framerTransition.workbenchPaneMount)',
    ],
  },
  {
    role: 'push.rail',
    patterns: [
      'useMotionPresence(framerPresence.detailStackPush)',
      'useMotionTransition(framerTransition.sidebarNavColumnMount)',
    ],
  },
  { role: 'gesture.press', patterns: ['framerGesture.tapPress'] },
];

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkTsx(full, out);
    else if (extname(entry) === '.tsx') out.push(full);
  }
  return out;
}

test('no surface uses a role pair raw — roles are adopted, not optional', () => {
  const offenders: string[] = [];
  for (const file of walkTsx(SRC)) {
    const rel = relative(SRC, file).split('\\').join('/');
    if (rel.startsWith(EXEMPT_PREFIX)) continue;
    const text = readFileSync(file, 'utf8');
    for (const { role, patterns } of RAW_ROLE_USE) {
      for (const p of patterns) {
        if (text.includes(p)) offenders.push(`${rel}\n    ${p}  → use motionRole.${role}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `Raw role-pair use:\n  ${offenders.join('\n  ')}`);
});

/**
 * A no-op `void framerPresence.x;` exists only to make a TEXT-matching guard see
 * a preset name that the component does not actually use — it defeats the guard
 * rather than satisfying it. `OmnichannelComposerDock` shipped exactly that
 * (comment: "Keep named presets referenced so ratchet/docs stay aligned") while
 * hand-rebuilding `workbenchPaneMount` inline.
 *
 * Compose the preset (or a role) for real, or don't reference it.
 */
// EMPTY, and it stays that way. `OmnichannelComposerDock` was the sole entry
// until 2026-08-01; it now composes the named `framerPresence.composerDock` /
// `framerTransition.composerDockMount` pair instead of hand-rebuilding the pane
// transition behind two `void`s. SHRINKS ONLY — a new entry here is a request to
// keep faking adoption, which is the one thing this guard exists to catch.
const VOID_ALLOWLIST: ReadonlyArray<string> = [];

test('no void-statement references to motion presets', () => {
  const offenders: string[] = [];
  for (const file of walkTsx(SRC)) {
    const rel = relative(SRC, file).split('\\').join('/');
    if (rel.startsWith(EXEMPT_PREFIX) || VOID_ALLOWLIST.includes(rel)) continue;
    const text = readFileSync(file, 'utf8');
    if (/\bvoid\s+(framerPresence|framerTransition|framerGesture|motionRole)\./.test(text)) {
      offenders.push(rel);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `A \`void <preset>\` statement fakes adoption for a text guard. Compose it for real:\n  ${offenders.join('\n  ')}`,
  );
});
