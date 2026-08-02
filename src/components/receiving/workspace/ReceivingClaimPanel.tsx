'use client';

import type { ReactNode } from 'react';
import { AnimatePresence, motion, motionRole, useMotionRole } from '@/design-system/motion';

import {
  useReceivingClaimController,
  type ClaimModalProps,
  type ReceivingClaimController,
} from './claim/hooks/useReceivingClaimController';
import { ClaimModalHeader } from './claim/components/ClaimModalHeader';
import { ClaimWizardNav } from './claim/components/ClaimWizardNav';
import { ClaimPhotosStep } from './claim/components/ClaimPhotosStep';
import { ClaimComposeStep } from './claim/components/ClaimComposeStep';
import { ClaimReviewStep } from './claim/components/ClaimReviewStep';
import { ClaimFiledStep } from './claim/components/ClaimFiledStep';
import { ClaimSellerStep } from './claim/components/ClaimSellerStep';
import { ClaimLinkFindStep } from './claim/components/ClaimLinkFindStep';
import { ClaimModalFooter } from './claim/components/ClaimModalFooter';
import { cn } from '@/utils/_cn';

/**
 * Claim wizard body — header, stepper, step content, footer.
 * Hosted by {@link ReceivingClaimStack} (Unbox push) or {@link ReceivingClaimModal}
 * (centered overlay for Testing / dashboard / triage).
 */
export function ReceivingClaimPanel({
  className,
  ...props
}: ClaimModalProps & { className?: string }) {
  const c = useReceivingClaimController(props);

  return (
    <div
      className={cn('flex h-full min-h-0 flex-col', className)}
      data-testid="receiving-claim-panel"
    >
      <ClaimModalHeader
        row={c.row}
        submitting={c.submitting}
        archiveSubmitting={c.archiveSubmitting}
        onClose={c.onClose}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-role-data">
        <ClaimWizardNav c={c} />
        <ClaimStepBody c={c} />
      </div>

      <ClaimModalFooter c={c} />
    </div>
  );
}

/** Crossfades the active step body keyed on the step id; the stepper stays put. */
function ClaimStepBody({ c }: { c: ReceivingClaimController }) {
  // `motionRole.swap.focus` — the pointer-driven focus-surface swap, taken as
  // one pair so the presence can never drift onto another job's timing.
  const { presence: presence, transition: transition } = useMotionRole(motionRole.swap.focus);

  let body: ReactNode;
  switch (c.step) {
    case 'find':
      body = <ClaimLinkFindStep c={c} />;
      break;
    case 'photos':
      body = <ClaimPhotosStep c={c} />;
      break;
    case 'compose':
      body = <ClaimComposeStep c={c} />;
      break;
    case 'review':
      body = <ClaimReviewStep c={c} />;
      break;
    case 'filed':
      body = <ClaimFiledStep c={c} mode={c.mode === 'link' ? 'linked' : 'created'} />;
      break;
    case 'seller':
      body = <ClaimSellerStep c={c} />;
      break;
    default: {
      const _exhaustive: never = c.step;
      body = _exhaustive;
    }
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={`${c.mode}:${c.step}`}
        initial={presence.initial}
        animate={presence.animate}
        exit={presence.exit}
        transition={transition}
        className="space-y-3 pt-3"
      >
        {body}
      </motion.div>
    </AnimatePresence>
  );
}
