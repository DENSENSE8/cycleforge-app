'use client';

/**
 * Incoming-mode facet rail — the route's OWN sidebar, resident in the spine.
 *
 * Answers **POS vs Email Triage** (`?incview=`). Purchasing-source tabs
 * (All / Zoho / eBay) live in {@link IncomingWorkspaceHeader}; delivery
 * attention + date refinements live in that header's filter popover.
 *
 * **This rail is the ONLY writer of `incview`.** `?inbound=` is owned by the
 * workbench header tabs; `?state=` by the filter popover.
 */

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Inbox, Mail } from '@/components/Icons';
import { SidebarShell } from '@/components/layout/SidebarShell';
import type { SidebarSection } from '@/components/sidebar/SidebarSectionList';
import { SidebarFacetGroup } from '@/components/sidebar/SidebarFacetGroup';
import { useIncomingEmailCount } from '@/components/receiving/EmailTriagePanel';
import type { IncomingView } from '@/components/receiving/EmailTriagePanel';
import { receivingSurfaceBasePath } from '@/lib/receiving/surface-path';
import { cn } from '@/utils/_cn';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import { useIncomingTableTotal } from './incoming/useIncomingTableTotal';

export type {
  IncomingDeliveryState,
  IncomingSummary,
} from './incoming/incoming-summary-types';

export function IncomingSidebarPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const base = receivingSurfaceBasePath(pathname);

  const value: IncomingView = searchParams.get('incview') === 'email' ? 'email' : 'pos';
  const posCount = useIncomingTableTotal();
  const emailCount = useIncomingEmailCount();

  const setView = useCallback(
    (next: IncomingView) => {
      const params = new URLSearchParams(searchParams.toString());
      // `pos` is the default — drop it from the URL to keep deep links clean.
      if (next === 'pos') params.delete('incview');
      else params.set('incview', next);
      router.replace(`${base}?${params.toString()}`);
    },
    [router, searchParams, base],
  );

  const viewSections = useMemo((): SidebarSection<IncomingView>[] => [
    {
      id: 'pos',
      label: 'Incoming POS',
      count: posCount,
      icon: <Inbox className="h-3.5 w-3.5" />,
    },
    {
      id: 'email',
      label: 'Email Triage',
      count: emailCount,
      icon: <Mail className="h-3.5 w-3.5" />,
    },
  ], [posCount, emailCount]);

  const isPos = value === 'pos';

  return (
    <SidebarShell
      className={cn('flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden', appChromeClass)}
      headerAbove={
        <SidebarFacetGroup
          label="Views"
          sections={viewSections}
          active={value}
          onSelect={setView}
          ariaLabel="Incoming view"
        />
      }
      bodyClassName="pb-4"
    >
      {isPos ? null : (
        <p className="text-role-caption text-text-soft">
          Unmatched shipping emails open in the workbench.
        </p>
      )}
    </SidebarShell>
  );
}
