/**
 * Motion ROLES — the intent layer over the preset catalog.
 *
 * A role names a JOB ("this is a scan-cadence swap", "this is a push that
 * reflows its siblings") and binds it to physics the house already ships. It
 * invents nothing: every field below is a reference to an existing
 * `framerPresence` / `framerTransition` / `framerGesture` value, so a role and
 * the literal it resolves to are the same object, not a copy that can drift.
 *
 * WHY this exists. `motion-framer.ts` is ~60 named literals that answer "which
 * curve" but never "which job", so two siblings doing the same job picked
 * different literals and neither was wrong. The catalog stays — it is the
 * implementation — but new surfaces pick a role.
 *
 * FIVE roles, and the count is the point. A sixth role is a claim that a new
 * JOB exists. Wanting a different duration for an existing job is the drift
 * this layer exists to stop; change the preset (and every surface with that
 * job) instead of adding a role.
 *
 * PURE VALUE MODULE — no React, no hooks, no `'use client'`. Hosts consume
 * `presence` through `useMotionPresence` and `transition` through
 * `useMotionTransition`, exactly as they do with raw presets today.
 *
 * Law + region matrix: `.claude/rules/display/motion-crossfade.md`.
 * SoT row: `.claude/rules/source-of-truth.md` → Motion roles + import path.
 */

import {
  framerGesture,
  framerPresence,
  framerTransition,
} from '../foundations/motion-framer';

/**
 * Region contracts a role is legal in — documentation carried in the type, so a
 * reviewer can see at the definition that `swap.scan` on a Workbench pane is
 * out of contract. Not enforced at runtime: the region a component renders in
 * is not knowable from the component.
 */
type MotionRegion = 'station' | 'workbench' | 'monitor' | 'canvas';

export const motionRole = {
  swap: {
    /**
     * Station active-surface swap at SCAN cadence.
     *
     * The exit carries its own `duration: 0` (from `framerPresence`), so
     * `mode="wait"` — which must stay, or two absolutely-positioned panes
     * double-image — completes instantly and the next entity paints on the
     * following frame. That zero exit is the contract: it turned ~0.6s of empty
     * canvas per scan into a 0.12s enter fade on the Unbox bench. Do not
     * "normalise" it to match `swap.focus`.
     */
    scan: {
      presence: framerPresence.stationCartonSwap,
      transition: framerTransition.stationCartonSwapMount,
      regions: ['station'] as const satisfies readonly MotionRegion[],
    },
    /**
     * Pointer-driven FOCUS-surface swap — the singular detail region reacting to
     * a selection change. Never the collection map, stream, or graph.
     */
    focus: {
      presence: framerPresence.workbenchPane,
      transition: framerTransition.workbenchPaneMount,
      regions: ['workbench', 'monitor', 'canvas'] as const satisfies readonly MotionRegion[],
    },
  },

  /**
   * The deliberate PUSH toggle — a column that makes room for itself and
   * reflows its siblings (nav spine, context rail, right-rail inspector,
   * station push columns).
   *
   * TWEEN, NEVER A SPRING. A spring overshoots its target, and the target here
   * is the width every sibling lays out against — the work surface would
   * visibly rubber-band on every open. `motionBezier.layout` is the softer
   * curve the house reserves for geometry.
   *
   * The presence is opacity-ONLY on purpose: the column's own width tween owns
   * arrive and leave, so an `x` translate would slide the card out of the very
   * slot it just reserved in the flow. (`framerPresence.detailStackOverlay`
   * carries the 48px `x` — that is the fixed/overlay branch, a different job.)
   */
  push: {
    rail: {
      presence: framerPresence.detailStackPush,
      transition: framerTransition.sidebarNavColumnMount,
      regions: ['workbench', 'monitor', 'station'] as const satisfies readonly MotionRegion[],
    },
  },

  /**
   * Physical press feedback on a tappable surface.
   *
   * `whileTap` only — no pinned transition, because no call site pins one
   * today: framer's default press spring is what `CardShell` and the station
   * benches actually ship, and naming a spring here would be inventing physics
   * to fill a field.
   *
   * A press is the one role SUPPRESSED outright under reduced motion rather
   * than crossfaded — `useMotionRole` returns `whileTap: undefined`, matching
   * what `CardShell` and `ActiveOrderScanFeedback` hand-roll today. A 0.9 scale
   * that snaps instead of springing is worse than no feedback at all.
   */
  gesture: {
    press: {
      whileTap: framerGesture.tapPress,
      regions: ['station', 'workbench'] as const satisfies readonly MotionRegion[],
    },
  },

  /**
   * Transient acknowledgement flash on an element that is already mounted —
   * copy-confirmed, value-committed, a live cell update.
   *
   * Transition only, and that is not an omission: a pulse animates a VALUE on a
   * mounted element, so it has no initial/animate/exit shape. The host drives
   * the opacity (or colour) target and hands this transition to it.
   *
   * Per `motion-crossfade.md` D12: a live grid cell update flashes — it never
   * slides or layout-shifts.
   */
  feedback: {
    pulse: {
      transition: framerTransition.chipCopyFeedback,
      regions: ['station', 'workbench'] as const satisfies readonly MotionRegion[],
    },
  },
} as const;

/** A role that owns a mount/unmount shape — consumable by `useMotionRole`. */
export type PresenceRole = {
  presence: { initial: object; animate: object; exit?: object };
  transition: object;
};
