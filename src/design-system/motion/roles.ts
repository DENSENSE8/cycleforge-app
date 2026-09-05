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
 * Six roles became seven when Displays leaf-commit earned `feedback.hitMarker`
 * (2026-08-07) — a different JOB from `feedback.pulse` (generic mounted ack /
 * copy flash). Wanting a different duration for an existing job is still the
 * drift this layer exists to stop; change the preset (and every surface with
 * that job) instead of adding a role.
 *
 * PURE VALUE MODULE — no React, no hooks, no `'use client'`. Hosts consume
 * `presence` through `useMotionPresence` and `transition` through
 * `useMotionTransition`, exactly as they do with raw presets today.
 *
 * Law + region matrix:.
 * SoT row: Motion roles + import path.
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
   * what `CardShell` hand-rolls today. A 0.9 scale
   * that snaps instead of springing is worse than no feedback at all.
   */
  gesture: {
    press: {
      whileTap: framerGesture.tapPress,
      regions: ['station', 'workbench'] as const satisfies readonly MotionRegion[],
    },
  },

  /**
   * The DESK pointer-cursor layer — a fixed dot that chases the pointer and
   * takes the geometry of whatever it is over.
   *
   * Transition-only, like {@link feedback.pulse}: a cursor has no
   * initial/animate/exit shape, it has a position and a size that are always
   * springing toward a target. The host owns the targets; this owns the physics.
   *
   * NOT a station role, and that omission is the contract. A floor station is a
   * mounted touchscreen driven by a gloved hand and a scan gun — there is no
   * pointer to follow, so the layer is gated on `(pointer: fine)` and never
   * mounts there. Adding 'station' to these regions would put a decoration in
   * the throughput path.
   *
   * `follow` is duration-0 (glued to the pointer). `morph` is the travelling-
   * marker spring so size/shape still read as one object changing. A spring on
   * x/y is lag — never put `springSnappy` on follow.
   */
  cursor: {
    follow: {
      transition: framerTransition.cursorFollow,
      regions: ['workbench', 'monitor', 'canvas'] as const satisfies readonly MotionRegion[],
    },
    morph: {
      transition: framerTransition.cursorMorph,
      regions: ['workbench', 'monitor', 'canvas'] as const satisfies readonly MotionRegion[],
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
   * Physics = `fadeInstant` via `framerTransition.chipCopyFeedback`. Prefer
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
      transition: framerTransition.chipCopyFeedback,
      regions: ['station', 'workbench'] as const satisfies readonly MotionRegion[],
    },
    /**
     * Confirm / selection depth on a surface that **stays mounted** (scan-station
     * middle procedure pager, future MasterNav twin). Transition only.
     *
     * **Never** gate Station Displays leaf/verb mount behind this role — right
     * rail paints DOM in the same turn as click (`commitArmed` sync). Physics =
     * `framerTransition.hitMarker` (100ms easeOut, ≤150ms). Audio stays off.
     */
    hitMarker: {
      transition: framerTransition.hitMarker,
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
     * Physics = `framerTransition.liveValueChange` (+ `liveValueMorph` for
     * the label half). Consumer: `GridStatusCellValue` via
     * `useLiveValueChange`, which is where every data-table status chip in
     * the app already resolves.
     *
     * Monitor is legal here and is not a widening: a rollup board is exactly
     * the read-only surface where a change nobody clicked is the only kind
     * there is.
     */
    liveChange: {
      transition: framerTransition.liveValueChange,
      morph: framerTransition.liveValueMorph,
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
      transition: framerTransition.procedureStackLayout,
      regions: ['station', 'workbench'] as const satisfies readonly MotionRegion[],
    },
  },
} as const;

/** A role that owns a mount/unmount shape — consumable by `useMotionRole`. */
export type PresenceRole = {
  presence: { initial: object; animate: object; exit?: object };
  transition: object;
};
