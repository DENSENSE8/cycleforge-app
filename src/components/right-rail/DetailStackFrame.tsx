'use client';

/**
 * Detail stack layout tokens + shared aside surface classes.
 * SoT: `@/design-system/shells/detail-stack`.
 * Push columns snap instantly in `RightRailHost`; overlay backdrop / presence
 * still live there so `AnimatePresence` can own direct `motion.*` children.
 */

export {
  DETAIL_STACK_LAYOUT,
  DETAIL_STACK_RESIZE,
  DETAIL_STACK_COLLAPSE,
  DETAIL_STACK_PUSH_COLUMN_CLASS,
  DETAIL_STACK_PUSH_STRIP_CLASS,
  DETAIL_INSPECTOR_COLLAPSE_EVENT,
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
  type DetailInspectorCollapseDetail,
} from '@/design-system/shells/detail-stack';
