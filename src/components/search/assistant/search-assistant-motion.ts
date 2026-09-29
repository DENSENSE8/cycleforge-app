import {
  defineStateMotionContract,
  type TargetAndTransition,
} from '@/design-system/motion';
import { aiTransition } from '@/design-system/ai';

export type SearchAssistantFrameState = 'closed' | 'composing' | 'conversing';

export interface SearchAssistantVisualTarget {
  paneMounted: boolean;
  floatingComposerMounted: boolean;
  invitationMounted: boolean;
}

export const SEARCH_ASSISTANT_COMPOSER_LAYOUT_ID = 'search-ai-composer';
export const SEARCH_ASSISTANT_PANE_WIDTH_PX = 440;

export const SEARCH_ASSISTANT_CONTRACT = defineStateMotionContract<
  SearchAssistantFrameState,
  SearchAssistantVisualTarget
>({
  targets: {
    closed: {
      paneMounted: false,
      floatingComposerMounted: true,
      invitationMounted: true,
    },
    composing: {
      paneMounted: false,
      floatingComposerMounted: true,
      invitationMounted: false,
    },
    conversing: {
      paneMounted: true,
      floatingComposerMounted: false,
      invitationMounted: false,
    },
  },
  transition: aiTransition.composerGlide,
  reducedTransition: { duration: 0 },
});

/** Open state and real transcript state are the sole authorities. */
export function resolveSearchAssistantFrameState(
  open: boolean,
  messageCount: number,
): SearchAssistantFrameState {
  if (!open) return 'closed';
  return messageCount > 0 ? 'conversing' : 'composing';
}

export interface SearchAssistantPaneMotion {
  initial: TargetAndTransition;
  animate: TargetAndTransition;
  exit: TargetAndTransition;
  transition: typeof aiTransition.panel | { duration: 0 };
}

/** Reduced motion preserves context with opacity and removes spatial travel. */
export function searchAssistantPaneMotion(reduced: boolean): SearchAssistantPaneMotion {
  if (reduced) {
    return {
      initial: { opacity: 0, width: SEARCH_ASSISTANT_PANE_WIDTH_PX },
      animate: { opacity: 1, width: SEARCH_ASSISTANT_PANE_WIDTH_PX },
      exit: { opacity: 0 },
      transition: { duration: 0 },
    };
  }
  return {
    initial: { opacity: 0, width: 0, x: -24 },
    animate: { opacity: 1, width: SEARCH_ASSISTANT_PANE_WIDTH_PX, x: 0 },
    exit: { opacity: 0, width: 0, x: -24 },
    transition: aiTransition.panel,
  };
}
