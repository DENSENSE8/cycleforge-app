'use client';

/**
 * The Pack bench's connected history dock — this week's packs, newest first.
 *
 * Reads `usePackerLogs`, the same query `PackRecentPacksRail` reads, so the two
 * share a react-query cache entry rather than fetching twice while the rail is
 * still mounted.
 */

import { usePackerLogs } from '@/hooks/usePackerLogs';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import {
  StationHistoryDock,
  StationHistoryDockRow,
} from '@/components/station/StationHistoryDock';
import {
  useTechStationDockEntries,
} from '@/components/station/station-history-dock-feeds';

export function PackHistoryDock({ packerId }: { packerId: number }) {
  // No `weekRange` override: the hook defaults to the current PST week, which is
  // exactly the window the bench means. Passing one computed here would be a
  // second implementation of the same civil-week arithmetic — and a cache key
  // that drifts from the rail's whenever the two disagree by a millisecond.
  const { data: records = [], isLoading } = usePackerLogs(packerId);
  const { getStaffName } = useStaffNameMap();

  const entries = useTechStationDockEntries(
    records.map((r) => ({
      id: Number(r.packer_log_id ?? r.id ?? 0),
      created_at: String(r.created_at ?? ''),
      order_id: r.order_id ?? null,
      shipping_tracking_number: r.shipping_tracking_number ?? null,
      product_title: r.product_title ?? null,
    })),
    getStaffName,
    () => (packerId > 0 ? packerId : undefined),
  );

  if (packerId <= 0) return null;

  return (
    <StationHistoryDock
      station="Pack"
      count={entries.length}
      loading={isLoading}
      emptyMessage="Nothing packed on this bench this week."
    >
      {entries.length > 0
        ? entries.map((entry) => (
            <StationHistoryDockRow
              key={entry.key}
              time={entry.time}
              identifier={entry.identifier}
              meta={entry.meta}
            />
          ))
        : null}
    </StationHistoryDock>
  );
}
