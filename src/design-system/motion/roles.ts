/** Motion ROLES — the intent layer over the preset catalog. */

import {
  framerGesture,
  framerPresence,
  framerTransition,
} from '../foundations/motion-framer';

/** Region contracts a role is legal in — documentation carried in the type, so a reviewer can see at the definition that `swap.scan` on a… */
type MotionRegion = 'station' | 'workbench' | 'monitor' | 'canvas';

export const motionRole = {
  swap: {
    /** Station active-surface swap at SCAN cadence. */
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

  /** The deliberate PUSH toggle — a column that makes room for itself and reflows its siblings (nav spine, context rail, right-rail… */
  push: {
    rail: {
      presence: framerPresence.detailStackPush,
      transition: framerTransition.sidebarNavColumnMount,
      regions: ['workbench', 'monitor', 'station'] as const satisfies readonly MotionRegion[],
    },
  },

  /** Physical press feedback on a tappable surface. */
  gesture: {
    press: {
      whileTap: framerGesture.tapPress,
      regions: ['station', 'workbench'] as const satisfies readonly MotionRegion[],
    },
  },

  /** Transient acknowledgement flash on an element that is already mounted — copy-confirmed, value-committed, a live cell update. */
  feedback: {
    pulse: {
      transition: framerTransition.chipCopyFeedback,
      regions: ['station', 'workbench'] as const satisfies readonly MotionRegion[],
    },
    /** Confirm / selection depth on a surface that **stays mounted** (scan-station middle procedure pager, future MasterNav twin). */
    hitMarker: {
      transition: framerTransition.hitMarker,
      regions: ['station', 'workbench'] as const satisfies readonly MotionRegion[],
    },
    /** A VALUE on a collection row changed REMOTELY — the eighth role, and a genuinely different job from the two above it (2026-08-20). */
    liveChange: {
      transition: framerTransition.liveValueChange,
      morph: framerTransition.liveValueMorph,
      regions: ['station', 'workbench', 'monitor'] as const satisfies readonly MotionRegion[],
    },
  },

  /** Procedure Focus Deck layout settle — **deferred / unused** (flat foundation 2026-08-03). */
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
