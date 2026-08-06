'use client';

import { TabDisplay } from '@/design-system/components';
import type { ClaimModalMode } from '../claim-types';
import type { ReceivingClaimController } from '../hooks/useReceivingClaimController';

/**
 * Claim child mode (New ticket · Link existing).
 *
 * Hierarchy: parent Chat·Claim lives on {@link TicketDisplayHost} as underline
 * `TabDisplay`. This nav is the **child** segmented layer — lighter than the
 * parent. Section progress is the stacked scroll body (no ScrollSpy strip).
 *
 * Cybertruck stack: `gap-0` under Chat·Claim. Mode row shares one flush
 * instrument column with the topic plate above.
 */
export function ClaimWizardNav({ c }: { c: ReceivingClaimController }) {
  return (
    <div className="flex shrink-0 flex-col gap-0 border-b border-border-hairline">
      <TabDisplay
        tabs={[
          { id: 'create', label: 'New ticket' },
          { id: 'link', label: 'Link existing' },
        ]}
        activeTab={c.mode}
        onTabChange={(id) => c.handleModeChange(id as ClaimModalMode)}
        density="nested"
        fit="fill"
        appearance="segment"
        aria-label="Claim mode"
        className="rounded-none border-x-0 border-t-0"
      />
    </div>
  );
}
