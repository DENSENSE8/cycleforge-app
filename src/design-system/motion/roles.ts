/**
 * Motion ROLES — optional named presets over the preset catalog.
 *
 * A role names a job ("scan-cadence swap", "push that reflows its siblings")
 * and points at physics the house already ships. Use one when it fits; animate
 * freely with `motion/react` when it does not — motion rules were abolished
 * (owner 2026-09-27, BRIEF §13). The `regions` fields are descriptive only.
 *
 * PURE VALUE MODULE — no React, no hooks, no `'use client'`.
 */

import {
  motionGesture,
  motionPresence,
  motionTransition,
} from '../foundations/motion-presets';

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
     * The exit carries its own `duration: 0` (from `motionPresence`), so
     * `mode="wait"` — which must stay, or two absolutely-positioned panes
     * double-image — completes instantly and the next entity paints on the
     * following frame. That zero exit is the contract: it turned ~0.6s of empty
     * canvas per scan into a 0.12s enter fade on the Unbox bench. Do not
     * "normalise" it to match `swap.focus`.
     */
    scan: {
      presence: motionPresence.stationCartonSwap,
      transition: motionTransition.stationCartonSwapMount,
      regions: ['station'] as const satisfies readonly MotionRegion[],
    },
    /**
     * Pointer-driven FOCUS-surface swap — the singular detail region reacting to
     * a selection change. Never the collection map, stream, or graph.
     */
    focus: {
      presence: motionPresence.workbenchPane,
      transition: motionTransition.workbenchPaneMount,
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
   * slot it just reserved in the flow. (`motionPresence.detailStackOverlay`
   * carries the 48px `x` — that is the fixed/overlay branch, a different job.)
   */
  push: {
    rail: {
      presence: motionPresence.detailStackPush,
      transition: motionTransition.sidebarNavColumnMount,
      regions: ['workbench', 'monitor', 'station'] as const satisfies readonly MotionRegion[],
    },
  },

  /**
   * Physical press feedback on a tappable surface.
   *
   * `whileTap` only — no pinned transition, because no call site pins one
   * today: Motion's default press spring is what `CardShell` and the station
   * benches actually ship, and naming a spring here would be inventing physics
   * to fill a field.
   *
   * A press is the one role SUPPRESSED outright under reduced motion rather
   * than crossfaded — `useMotionRole` returns `whileTap: undefined`, matching
   * what `CardShell` hand-rolls today. A 0.9 scale
   * that snaps instead of springing is worse than no feedback at all.
   */
  gesture: {
    press: {
      whileTap: motionGesture.tapPress,
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
   * Physics = `fadeInstant` via `motionTransition.chipCopyFeedback`. Prefer
   * `ActionFlashRow` when the flash is a full-bleed dense ledger row wash.
   *
   * Per `motion-crossfade.md` D12: a live grid cell update flashes — it never
   * slides or layout-shifts.
   *
   * **Not** scan-middle selection depth — that is {@link feedback.hitMarker}
   * / `selectionPulse` on the procedure pager. Do not retarget `pulse` for
   * that juice. Displays right-rail open must never wait on either.
   */
  feedback: {
    pulse: {
      transition: motionTransition.chipCopyFeedback,
      regions: ['station', 'workbench'] as const satisfies readonly MotionRegion[],
    },
    /**
     * Confirm / selection depth on a surface that **stays mounted** (scan-station
     * middle procedure pager, future MasterNav twin). Transition only.
     *
     * **Never** gate Station Displays leaf/verb mount behind this role — right
     * rail paints DOM in the same turn as click (`commitArmed` sync). Physics =
     * `motionTransition.hitMarker` (100ms easeOut, ≤150ms). Audio stays off.
     */
    hitMarker: {
      transition: motionTransition.hitMarker,
      regions: ['station', 'workbench'] as const satisfies readonly MotionRegion[],
    },
    /**
     * A VALUE on a collection row changed REMOTELY — the eighth role, and a
     * genuinely different job from the two above it (2026-08-20).
     *
     * `pulse` and `hitMarker` both acknowledge something the operator just
     * did, on the element under their own cursor. This one fires on an
     * element nobody is looking at: a tester scans a tracking number at the
     * bench, and the packer's Unshipped board — 40 rows, three tabs away from
     * the row in question — has to make the change findable in peripheral
     * vision. "Which of these do I use?" has a real answer here: if you can
     * name the click that caused it, it is not this role.
     *
     * Shape: double pulse (scale + ring overlay) with the label morphing
     * inside the first beat, then a settle. Transform + opacity only, so a
     * ruled grid band never reflows to report a word change.
     * Physics = `motionTransition.liveValueChange` (+ `liveValueMorph` for
     * the label half). Consumer: `GridStatusCellValue` via
     * `useLiveValueChange`, which is where every data-table status chip in
     * the app already resolves.
     *
     * Monitor is legal here and is not a widening: a rollup board is exactly
     * the read-only surface where a change nobody clicked is the only kind
     * there is.
     */
    liveChange: {
      transition: motionTransition.liveValueChange,
      morph: motionTransition.liveValueMorph,
      regions: ['station', 'workbench', 'monitor'] as const satisfies readonly MotionRegion[],
    },
  },

  /**
   * Procedure Focus Deck layout settle — **deferred / unused** (flat foundation
   * 2026-08-03). `ProcedureDeck` is a plain expandable list; step advance uses
   * `swap.scan` + `procedureFocusBody` only. Keep the role in the catalog so a
   * future deliberate revive does not invent a seventh job — do not wire it on
   * the deck without amending SoT.
   */
  procedure: {
    advance: {
      transition: motionTransition.procedureStackLayout,
      regions: ['station', 'workbench'] as const satisfies readonly MotionRegion[],
    },
  },

  /**
   * The RECORD PLANE (`DeskRecordPlane`) — list–detail on a triage desk.
   * `pane`: the split view's record pane arriving beside the list, on the
   * house utilitarian spring (48px from the right + fade). The record swap
   * inside either view (J/K, a clicked row) is {@link swap.focus}, not a new
   * job. Industrial regions pin both to 0 ms at the host.
   */
  record: {
    pane: {
      presence: motionPresence.detailStackOverlay,
      transition: motionTransition.recordPaneMount,
      regions: ['workbench'] as const satisfies readonly MotionRegion[],
    },
  },
} as const;

/** A role that owns a mount/unmount shape — consumable by `useMotionRole`. */
export type PresenceRole = {
  presence: { initial: object; animate: object; exit?: object };
  transition: object;
};
