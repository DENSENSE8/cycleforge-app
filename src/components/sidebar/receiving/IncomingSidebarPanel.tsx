'use client';

/**
 * Incoming-mode facet rail — the route's OWN sidebar, resident in the spine.
 *
 * On Pipeline: answers **POS vs Email Triage / Recently removed** (`?incview=`).
 * Purchasing-source filters and **saved views** (Band-3 Views ▾) live in
 * {@link IncomingWorkspaceHeader}. Scan periphery ≠ saved-views (see
 * `regional-sidebar-split-HANDOFF.md`).
 *
 * On Docked: short lane copy only — Triage / Unbox live in the workbench chrome.
 */

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Archive, Inbox, Mail } from '@/components/Icons';
import { SidebarShell } from '@/components/layout/SidebarShell';
import type { SidebarSection } from '@/components/sidebar/SidebarSectionList';
import { SidebarFacetGroup } from '@/components/sidebar/SidebarFacetGroup';
import { useIncomingEmailCount } from '@/components/receiving/EmailTriagePanel';
import { parseIncomingView, type IncomingView } from '@/lib/receiving/incoming-view';
import { parseInboundLane } from '@/lib/receiving/inbound-lane';
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
  const lane = parseInboundLane(searchParams.get('lane'));

  const value: IncomingView = parseIncomingView(searchParams.get('incview'));
  const posCount = useIncomingTableTotal();
  const emailCount = useIncomingEmailCount();

  const setView = useCallback(
    (next: IncomingView) => {
      const params = new URLSearchParams(searchParams.toString());
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
    {
      id: 'removed',
      label: 'Recently removed',
      icon: <Archive className="h-3.5 w-3.5" />,
    },
  ], [posCount, emailCount]);

  if (lane === 'docked') {
    return (
      <SidebarShell
        className={cn('flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden', appChromeClass)}
        bodyClassName="pb-4"
      >
        <p className="text-role-caption text-text-soft">
          Docked activity — scanned and unboxed cartons. Open a row for the carton
          record. Use Pipeline for purchases still on the way.
        </p>
      </SidebarShell>
    );
  }

  const laneHint =
    value === 'email'
      ? 'Unmatched shipping emails open in the workbench.'
      : value === 'removed'
        ? 'Rows that left Incoming in the last 7 days, each stating why. Paste tracking numbers to find a specific one.'
        : null;

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
      {laneHint ? <p className="text-role-caption text-text-soft">{laneHint}</p> : null}
    </SidebarShell>
  );
}
