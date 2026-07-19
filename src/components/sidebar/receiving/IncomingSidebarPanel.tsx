'use client';

import { SidebarShell } from '@/components/layout/SidebarShell';
import { sidebarHeaderPillRowClass } from '@/components/layout/header-shell';
import { cn } from '@/utils/_cn';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import { IncomingViewBand } from '@/components/receiving/IncomingViewBand';

export type {
  IncomingDeliveryState,
  IncomingCarrierBreakdown,
  IncomingSummary,
} from './incoming/incoming-summary-types';

/**
 * Incoming-mode sidebar — POS ↔ Email Triage band only.
 *
 * Search / filters / columns / Select / Sync live in
 * {@link IncomingWorkspaceHeader} on the right pane.
 */
export function IncomingSidebarPanel() {
  return (
    <SidebarShell
      className={cn('flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden', appChromeClass)}
      headerBelow={
        <div className={cn(sidebarHeaderPillRowClass, 'h-auto min-h-[40px] items-start pt-1 pb-2.5')}>
          <IncomingViewBand />
        </div>
      }
    />
  );
}
