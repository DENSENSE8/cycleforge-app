/** `@/design-system/motion` — the whole Motion engine plus the house presets (optional, owner 2026-09-27). */

export * from './react';

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
