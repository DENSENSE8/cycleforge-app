'use client';

/**
 * Detail stack layout tokens + shared aside surface classes.
 * SoT: `@/design-system/shells/detail-stack`.
 * Motion/backdrop live in `RightRailHost` so `AnimatePresence` can own
 * direct `motion.*` children (required for exit animations).
 */

export {
  DETAIL_STACK_LAYOUT,
  DETAIL_STACK_RESIZE,
  DETAIL_STACK_COLLAPSE,
  DETAIL_STACK_PUSH_COLUMN_CLASS,
  DETAIL_STACK_PUSH_STRIP_CLASS,
  assistantDockAsideClassName,
  assistantDockAsideStyle,
  detailStackAsideClassName,
  detailStackAsideElevatedClassName,
  detailStackAsideStyle,
  detailStackBackdropClassName,
  detailStackBackdropElevatedClassName,
  detailStackCollapseStripClassName,
  detailStackCollapseStripStyle,
  detailStackDismissLayerClassName,
  detailStackDismissLayerElevatedClassName,
} from '@/design-system/shells/detail-stack';
