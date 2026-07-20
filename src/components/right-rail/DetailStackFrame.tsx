'use client';

/**
 * Detail stack layout tokens + shared aside surface classes.
 * SoT: `@/design-system/shells/detail-stack`.
 * Motion/backdrop live in `RightRailHost` so `AnimatePresence` can own
 * direct `motion.*` children (required for exit animations).
 */

export {
  DETAIL_STACK_LAYOUT,
  assistantDockAsideClassName,
  assistantDockAsideStyle,
  detailStackAsideClassName,
  detailStackAsideElevatedClassName,
  detailStackAsideStyle,
} from '@/design-system/shells/detail-stack';
