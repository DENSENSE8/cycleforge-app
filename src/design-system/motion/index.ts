/** `@/design-system/motion` — THE motion import path for `src/`. */

export {
  motion,
  animate,
  AnimatePresence,
  MotionConfig,
  LayoutGroup,
  Reorder,
  useReducedMotion,
  useAnimationControls,
  useAnimationFrame,
  useMotionValue,
  useTransform,
  useDragControls,
} from './framer';

export type {
  Transition,
  Variants,
  PanInfo,
  HTMLMotionProps,
  DragControls,
} from './framer';

export { motionRole } from './roles';

export { useMotionRole, useMotionPressRole } from './use-motion-role';

/** The station overlay's cover-replace flag — one hook so the four surfaces that switch `mode` / `initial` / stacking on "already open?"… */
export { useOverlaySwapHardCut } from './use-overlay-swap-hard-cut';

/**
 * Idle browse hide + overlay pane stack — the only legal way a floor station
 * implements visibility-hide / inert / zIndex.panel. Workspaces call these;
 * they do not re-type the styles.
 */
export { idleBrowseLayerProps, overlayPaneStyle } from './idle-overlay';

/** The live-change pulse — the only symbol app code needs. */
export { useLiveValueChange } from './use-live-value-change';

/** The desk pointer-cursor layer — mount `MorphCursorLayer` ONCE, app-wide. */
export { useCursorScrub } from './use-cursor-scrub';
export {
  cursorClickTarget,
  cursorGrabTarget,
  cursorMorphTarget,
  cursorResizeTarget,
} from './cursor-scrub';
export type { CursorKind } from './cursor-scrub';
export { usePointerFine } from './use-pointer-fine';
