'use client';

/**
 * Focused new-order slide-over — same contract as Labels (`OutboundWorkspace`):
 * scrim does not dismiss on click; close only via the form's X / Cancel.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { ShippedIntakeForm } from '@/components/shipped/ShippedIntakeForm';
import { useShippedFormSubmit } from '@/components/sidebar/dashboard-sidebar-hooks';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { zIndex } from '@/design-system/tokens/z-index';

export function NewOrderEntryOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const submitNewOrder = useShippedFormSubmit(onClose);
  const paneMotionProps = {
    ...useMotionPresence(framerPresence.workbenchPaneSettle),
    transition: useMotionTransition(framerTransition.workbenchPaneSettle),
  };

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            key="new-order-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ zIndex: zIndex.panel }}
            className="absolute inset-0 bg-black/30"
            aria-hidden
          />
          <motion.div
            key="new-order-panel"
            {...paneMotionProps}
            style={{ zIndex: zIndex.panel }}
            className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-surface-card shadow-2xl"
            role="dialog"
            aria-label="New order entry"
            aria-modal="true"
          >
            <ShippedIntakeForm onClose={onClose} onSubmit={submitNewOrder} />
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
