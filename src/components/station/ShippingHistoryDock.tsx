'use client';

/**
 * The Shipping / Testing bench's connected history dock.
 *
 * Reads the feed the bench already fetches (`ShippingHistoryFeedProvider`,
 * mounted by `TechPageContent`) rather than firing its own query: the dock is a
 * second VIEW of the week's scans, not a second source of them, and a private
 * query here would double the request count on a route whose LCP is already the
 * thing being watched.
 *
 * Renders nothing outside the provider — a bench that has not mounted the feed
 * has no history to show, and an empty dock claiming otherwise would be chrome
 * inventing a story.
 */

import { useShippingHistoryFeedOptional } from '@/hooks/station/ShippingHistoryFeedProvider';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import {
  StationHistoryDock,
  StationHistoryDockRow,
} from '@/components/station/StationHistoryDock';
import { useTechStationDockEntries } from '@/components/station/station-history-dock-feeds';

export function ShippingHistoryDock({ station = 'Shipping' }: { station?: string }) {
  const feed = useShippingHistoryFeedOptional();
  const { getStaffName } = useStaffNameMap();
  const entries = useTechStationDockEntries(
    feed?.records,
    getStaffName,
    (record) => (record as { tested_by?: number }).tested_by,
  );

  if (!feed) return null;

  return (
    <StationHistoryDock
      station={station}
      count={entries.length}
      loading={feed.loading}
      emptyMessage="No scans on this bench this week."
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
