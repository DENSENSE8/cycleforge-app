import { useMemo } from 'react';
import { PaneHeaderTabs } from '@/components/ui/pane-header';
import { LinearWorkflowStepper } from '@/components/receiving/workspace/ReceivingProgressStepper';
import { claimWizardStepsForMode, type ClaimModalMode } from '../claim-types';
import type { ReceivingClaimController } from '../hooks/useReceivingClaimController';

/**
 * New-ticket / Link-existing mode tabs, plus a linear progress stepper for the
 * active flow. Create: Photos → Ticket → Review → Filed → Seller; link: Find →
 * Photos → Ticket → Review → Linked → Seller. The Seller dot is dropped on a
 * 'return' claim. The stepper is the stable map: clicking a reached step jumps
 * to it; only the body below crossfades.
 */
export function ClaimWizardNav({ c }: { c: ReceivingClaimController }) {
  const steps = useMemo(
    () => claimWizardStepsForMode(c.mode, c.sellerStepApplicable),
    [c.mode, c.sellerStepApplicable],
  );

  return (
    <div className="space-y-2.5 border-b border-border-hairline pb-2.5">
      <div className="flex justify-start">
        <PaneHeaderTabs<ClaimModalMode>
          tabs={[
            { value: 'create', label: 'New ticket' },
            { value: 'link', label: 'Link existing' },
          ]}
          value={c.mode}
          onChange={c.handleModeChange}
        />
      </div>

      <LinearWorkflowStepper
        steps={steps}
        states={c.claimStepStates}
        ariaLabel={c.mode === 'link' ? 'Link claim progress' : 'Claim progress'}
        size="compact"
        className="mx-auto w-full max-w-md px-2"
        onStepClick={c.handleStepClick}
        isStepDisabled={c.isStepDisabled}
      />
    </div>
  );
}
