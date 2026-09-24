/**
 * `@/design-system/motion` — THE motion import path for `src/`.
 *
 * Everything animated in this app imports from here. No file outside
 * `src/design-system/motion/**` may name a motion package; the guard
 * (`../foundations/motion-major.guard.test.ts`) fails the build if one does.
 *
 * What this barrel carries:
 *   - the ENGINE (`./framer` → `motion/react`) — `motion`, `AnimatePresence`, …
 *   - the ROLE layer (`./roles`) — `motionRole`, the intent vocabulary
 *   - the role HOOK (`./use-motion-role`) — role → render-ready bridged pair
 *
 * Physics tokens (`springSnappy` / `fadeInstant`) and dense primitives
 * (`DenseRowReveal` / `DenseList` / `ActionFlashRow`) live beside this barrel;
 * import them from their modules (or foundations catalog) until a first consumer
 * lands on the barrel — keeps knip from treating mid-wire SoT as dead exports.
 *
 * What it deliberately does NOT carry:
 *   - `AnimateNumber` — stays at `@/design-system/motion/plus`. Re-exporting it
 *     here would put `motion-plus` in the module graph of every consumer of this
 * barrel, which is the bundle-altitude trap in.
 *     (This barrel used to export exactly that one symbol, and nothing imported
 *     it — knip had it baselined as dead since it landed.)
 *   - the 60-literal preset CATALOG (`framerPresence` / `framerTransition` / …)
 *     and the reduced-motion bridge hooks. Both keep their
 *     `@/design-system/foundations/motion-framer*` paths: they are house modules,
 *     not packages, so they were never what the boundary is about — and funnelling
 *     them through here would add ~60 re-exports nothing imports from this file.
 *
 * Law: The import boundary.
 */

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

/**
 * The station overlay's cover-replace flag — one hook so the four surfaces that
 * switch `mode` / `initial` / stacking on "already open?" cannot each re-derive
 * it, and cannot re-derive it during render (a hydration mismatch on any
 * overlay that server-renders open).
 */
export { useOverlaySwapHardCut } from './use-overlay-swap-hard-cut';

/**
 * Idle browse hide + overlay pane stack — the only legal way a floor station
 * implements visibility-hide / inert / zIndex.panel. Workspaces call these;
 * they do not re-type the styles.
 */
export { idleBrowseLayerProps, overlayPaneStyle } from './idle-overlay';

/**
 * The live-change pulse — the only symbol app code needs. Its attribute name,
 * mark duration, predicate and ref shape stay on `./use-live-value-change`:
 * re-exporting them here would add four barrel entries nothing imports, which
 * is the mid-wire-SoT-reads-as-dead trap the header above describes.
 */
export { useLiveValueChange } from './use-live-value-change';

/**
 * The desk pointer-cursor layer — mount `MorphCursorLayer` ONCE, app-wide. It
 * is `(pointer: fine)` gated, so a floor station never mounts it and never
 * attaches a `pointermove` listener.
 *
 * A control opts into the morph with `cursorMorphTarget()` and publishes its
 * live drag value with `useCursorScrub`. `publishCursorScrub` stays on
 * `./cursor-scrub` — imperative writes belong to the few controls that own a
 * scrub, not on the barrel every animated surface imports.
 */
export { useCursorScrub } from './use-cursor-scrub';
export {
  cursorClickTarget,
  cursorGrabTarget,
  cursorMorphTarget,
  cursorResizeTarget,
} from './cursor-scrub';
export type { CursorKind } from './cursor-scrub';
export { usePointerFine } from './use-pointer-fine';
