'use client';

import { useQuery } from '@tanstack/react-query';
import { SidebarShell } from '@/components/layout/SidebarShell';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { StatusLegend, type StatusLegendItem } from '@/components/ui/StatusLegend';
import { UNSHIPPED_STATE_META, countUnshippedStates } from '@/lib/unshipped-state';
import { awaitingLabelsQuery } from '@/lib/queries/outbound-queries';
import { LabelsRecentRail } from '@/components/outbound/labels/LabelsRecentRail';
import { useOutboundUrlState } from '@/hooks/useOutboundUrlState';

const AWAITING_LEGEND: StatusLegendItem<'AWAITING_LABEL'>[] = [
  { state: 'AWAITING_LABEL', short: 'Awaiting' },
];

/**
 * Labels mode sidebar — ambient queue stats + the recent rails ("Labels
 * printed" staged slice + the staffer's "Recently shipped" ship-outs, both
 * `SidebarRecentRailBase`). Search, sort, and the Import control live in the
 * labels-station header (LabelsWorkspaceHeader); this rail is glanceable
 * context, not a second filter surface.
 */
export function LabelsModeBody() {
  const { q, sort } = useOutboundUrlState();

  const labelsQuery = useQuery(awaitingLabelsQuery({ searchQuery: q, sort }));
  const statusCounts = countUnshippedStates(labelsQuery.data ?? []);
  const queueCount = labelsQuery.data?.length ?? 0;

  return (
    <SidebarShell
      headerBelow={
        <div className={`${SIDEBAR_GUTTER} space-y-2 pb-1 pt-3`}>
          <StatusLegend
            items={AWAITING_LEGEND}
            meta={UNSHIPPED_STATE_META}
            counts={statusCounts}
            isFetching={labelsQuery.isFetching}
            activeState={null}
            onSelectState={() => undefined}
          />
          <p className="text-role-eyebrow font-bold uppercase tracking-widest text-violet-600">
            {queueCount} order{queueCount === 1 ? '' : 's'} awaiting label
          </p>
        </div>
      }
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-y-auto"
    >
      <LabelsRecentRail />
    </SidebarShell>
  );
}
