/**
 * `@/design-system/ai` — the AI design system. AI surfaces import their
 * tokens, recipes, motion and primitives from here (see ./README.md).
 */

export {
  AI_ACTION_CLASS,
  AI_CARD_CLASS,
  AI_CARD_GLYPH_CLASS,
  AI_CARD_SELECTED_CLASS,
  AI_CHIP_CLASS,
  AI_COLUMN_CLASS,
  AI_COMPOSER_DOCK_CLASS,
  AI_COMPOSER_SHELL_CLASS,
  AI_FOCUS_CLASS,
  AI_ICON_BUTTON_CLASS,
  AI_LABEL_CLASS,
  AI_NOTICE_CLASS,
  AI_PANEL_CLASS,
  AI_PRIMARY_BUTTON_CLASS,
  AI_PROSE_CLASS,
  AI_SKELETON_BAR_CLASS,
  AI_STEP_ROW_CLASS,
  AI_SURFACE_CLASS,
  AI_USER_BUBBLE_CLASS,
} from './classes';

export {
  AI_COMPOSER_LAYOUT_ID,
  AI_PHASE_SCRAMBLE_DURATION,
  AI_STEP_STAGGER,
  aiGesture,
  aiPresence,
  aiTransition,
  useMotionPresence,
  useMotionTransition,
} from './motion';

export { AiSurface } from './AiSurface';
export { AiComposer, type AiComposerProps } from './AiComposer';
export { AiArtifactCard, type AiArtifactCardProps } from './AiArtifactCard';
export { AiSidePanel, type AiSidePanelProps } from './AiSidePanel';
export { AiTurn } from './AiTurn';
export { AiTurnActions, useAiActionStates, type AiTurnAction, type AiTurnActionsProps } from './AiTurnActions';
export { AiIrisRing, AiIrisSpinner, AiShimmer } from './AiIris';
