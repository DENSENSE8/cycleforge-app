'use client';

/**
 * UnboxTrackingTab — the carton's carrier tracking timeline for the unbox
 * workspace's "Tracking" tab. Composition only: it runs the shared
 * incoming-details query (same `['incoming-details', poId]` cache the Incoming
 * panel uses, with 60s carrier polling) and hands the result to the existing
 * {@link ShipmentTab} — status hero + carrier `EventTimeline` + re-poll — so
 * there is no second timeline or carrier-status implementation.
 */

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from '@/components/Icons';
import { WorkspaceCard } from '@/design-system/components';
import { ShipmentTab } from '@/components/sidebar/receiving/incoming-details/ShipmentTab';
import type { DetailsResponse } from '@/components/sidebar/receiving/incoming-details/incoming-details-shared';

export function UnboxTrackingTab({ poId }: { poId: string }) {
  const { data, isLoading, isError } = useQuery<DetailsResponse>({
    queryKey: ['incoming-details', poId],
    queryFn: async () => {
      const res = await fetch(
        `/api/receiving-lines/incoming/details?po_id=${encodeURIComponent(poId)}`,
        { cache: 'no-store' },
      );
      if (!res.ok) throw new Error(`details ${res.status}`);
      return res.json();
    },
    enabled: poId.length > 0,
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  return (
    <WorkspaceCard variant="glass" overflow="visible" bodyClassName="p-4">
      {isLoading ? (
        <div className="flex items-center gap-2 px-1 py-6 text-role-caption text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading tracking…
        </div>
      ) : isError || !data ? (
        <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center text-role-caption text-rose-700">
          Could not load carrier tracking.
        </div>
      ) : (
        <ShipmentTab data={data} />
      )}
    </WorkspaceCard>
  );
}
