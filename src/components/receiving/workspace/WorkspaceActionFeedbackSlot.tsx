'use client';

/**
 * Single-slot feedback below the label preview — same position as receive
 * complete. Item-description saves, Zoho notes saves, etc. mount here instead
 * of inline under their editors.
 */

import { AnimatePresence, motion, motionRole, useMotionRole } from '@/design-system/motion';

import {
  InlineActionFeedbackCard,
  type InlineActionFeedbackPayload,
} from './InlineActionFeedbackCard';

export function WorkspaceActionFeedbackSlot({
  feedback,
  onDismiss,
}: {
  feedback: InlineActionFeedbackPayload | null;
  onDismiss: () => void;
}) {
  // `motionRole.swap.focus` — the pointer-driven focus-surface swap, taken as
  // one pair so the presence can never drift onto another job's timing.
  const { presence: presence, transition: transition } = useMotionRole(motionRole.swap.focus);

  return (
    <AnimatePresence mode="wait" initial={false}>
      {feedback ? (
        <motion.div
          key={feedback.at}
          initial={presence.initial}
          animate={presence.animate}
          exit={presence.exit}
          transition={transition}
        >
          <InlineActionFeedbackCard
            tone={feedback.tone}
            headline={feedback.headline}
            items={feedback.items}
            note={feedback.note}
            at={feedback.at}
            onDismiss={onDismiss}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
