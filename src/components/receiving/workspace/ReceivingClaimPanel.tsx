'use client';

import { useEffect, useMemo, useRef, type ReactNode } from 'react';

import {
  claimSectionDomId,
  claimWizardStepsForMode,
  type ClaimWizardStep,
} from './claim/claim-types';
import {
  useReceivingClaimController,
  type ClaimModalProps,
  type ReceivingClaimController,
} from './claim/hooks/useReceivingClaimController';
import { ClaimModalHeader } from './claim/components/ClaimModalHeader';
import { ClaimModeSelect } from './claim/components/ClaimModeSelect';
import { ClaimEmptySeedCreateHelper } from './claim/components/ClaimEmptySeedCreateHelper';
import { ClaimPhotosStep } from './claim/components/ClaimPhotosStep';
import { ClaimComposeStep } from './claim/components/ClaimComposeStep';
import { ClaimFiledStep } from './claim/components/ClaimFiledStep';
import { ClaimSellerStep } from './claim/components/ClaimSellerStep';
import { ClaimLinkFindStep } from './claim/components/ClaimLinkFindStep';
import { ClaimActionFooter } from './claim/components/ClaimPhaseActions';
import { cn } from '@/utils/_cn';

/**
 * Claim wizard body — Create|Link mode combobox + stacked scroll sections +
 * sticky File / Link & send footer. Ticket is editable fields only (no
 * duplicate review preview). Backup note sits on the sticky footer (leading).
 * Dismiss via header X / Displays →| (no Cancel).
 *
 * Create and Link share Photos · Claim type · Subject · Body · Recipients.
 * Link adds the ticket picker above that stack. Mode is a body flush combobox
 * (never a leaf-header New·Link segment twin).
 */
export function ReceivingClaimPanel({
  className,
  chrome = 'modal',
  ...props
}: ClaimModalProps & {
  className?: string;
  /** See {@link ClaimModalHeader} — Displays omits the gray identity band. */
  chrome?: 'modal' | 'display';
}) {
  const c = useReceivingClaimController(props);
  const scrollRef = useRef<HTMLDivElement>(null);

  const mountedSteps = useMemo(
    () => claimMountedSteps(c),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- derived from c fields below
    [
      c.mode,
      c.sellerStepApplicable,
      c.filedTicket,
      c.linkUpdateStatus,
    ],
  );

  const scrollSectionIntoView = (step: ClaimWizardStep) => {
    const el = scrollRef.current?.querySelector(`#${CSS.escape(claimSectionDomId(step))}`);
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const filedPhaseKey =
    c.mode === 'create'
      ? (c.filedTicket?.number ?? '')
      : c.linkUpdateStatus === 'posted'
        ? (c.filedTicket?.number ?? 'posted')
        : '';
  useEffect(() => {
    if (!filedPhaseKey) return;
    if (!mountedSteps.includes('filed')) return;
    c.setStep('filed');
    scrollSectionIntoView('filed');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- phase jump only
  }, [filedPhaseKey]);

  const continueToSellerScroll = () => scrollSectionIntoView('seller');

  const stepDefs = useMemo(
    () => claimWizardStepsForMode(c.mode, c.sellerStepApplicable),
    [c.mode, c.sellerStepApplicable],
  );

  return (
    <div
      className={cn('flex h-full min-h-0 flex-col', className)}
      data-testid="receiving-claim-panel"
      data-claim-chrome={chrome}
    >
      <ClaimModalHeader
        chrome={chrome}
        row={c.row}
        submitting={c.submitting}
        archiveSubmitting={c.archiveSubmitting}
        onClose={c.onClose}
      />

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-0 py-0 text-role-data"
      >
        <ClaimModeSelect c={c} />
        <ClaimEmptySeedCreateHelper c={c} />
        {mountedSteps.map((step) => {
          const def = stepDefs.find((s) => s.key === step);
          const index = stepDefs.findIndex((s) => s.key === step);
          const title = `${index + 1}. ${def?.label ?? step}`;
          return (
            <ClaimScrollSection key={step} id={claimSectionDomId(step)} title={title}>
              <ClaimSectionBody c={c} step={step} />
            </ClaimScrollSection>
          );
        })}
      </div>

      <ClaimActionFooter c={c} onContinueToSeller={continueToSellerScroll} />
    </div>
  );
}

function claimMountedSteps(c: ReceivingClaimController): ClaimWizardStep[] {
  const all = claimWizardStepsForMode(c.mode, c.sellerStepApplicable).map((s) => s.key);

  if (c.mode === 'create') {
    const draft: ClaimWizardStep[] = ['photos', 'compose'];
    if (c.filedTicket) {
      draft.push('filed');
      if (c.sellerStepApplicable) draft.push('seller');
    }
    return draft.filter((s) => all.includes(s));
  }

  // Link always shows picker + the same Photos · Compose stack as Create
  // (template body is the linkage message). Filed/seller after send posts.
  const out: ClaimWizardStep[] = ['find', 'photos', 'compose'];
  if (c.linkUpdateStatus === 'posted') {
    out.push('filed');
    if (c.sellerStepApplicable) out.push('seller');
  }
  return out.filter((s) => all.includes(s));
}

function ClaimScrollSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  // No visible "1. PHOTOS" / "2. TICKET" titles — content self-describes;
  // keep aria-label only for section landmarks.
  return (
    <section
      id={id}
      aria-label={title}
      className="scroll-mt-0 border-b border-border-hairline last:border-b-0"
    >
      <div className="py-0">{children}</div>
    </section>
  );
}

function ClaimSectionBody({
  c,
  step,
}: {
  c: ReceivingClaimController;
  step: ClaimWizardStep;
}) {
  switch (step) {
    case 'find':
      return <ClaimLinkFindStep c={c} />;
    case 'photos':
      return <ClaimPhotosStep c={c} />;
    case 'compose':
      return <ClaimComposeStep c={c} />;
    case 'filed':
      return <ClaimFiledStep c={c} mode={c.mode === 'link' ? 'linked' : 'created'} />;
    case 'seller':
      return <ClaimSellerStep c={c} />;
    default: {
      const _exhaustive: never = step;
      return _exhaustive;
    }
  }
}
