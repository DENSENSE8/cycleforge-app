'use client';

/** Flush feed pane — the shared body for the Sales-hub modes that render a day-banded transaction feed (Local Pickup · Sales), flush in… */

import { SalesTransactionsFeed } from '@/components/walk-in/SalesTransactionsFeed';
import { type WalkInTransaction } from '@/lib/walk-in/transactions';

interface WalkInFeedPaneProps {
  rows: WalkInTransaction[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  /** What the KPI heroes describe — the active mode/tab ("Sales · Today", …). */
  label: string;
  emptyMessage: string;
}

export function WalkInFeedPane({
  rows,
  isLoading,
  isError,
  refetch,
  label,
  emptyMessage,
}: WalkInFeedPaneProps) {

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-surface-canvas">
      {/* Feed flush in the sheet host; the scroll lives here so the day-band
          headers dock at top-0 of this region. */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="min-h-0 w-full flex-1 overflow-y-auto">
          <SalesTransactionsFeed
            rows={rows}
            isLoading={isLoading}
            isError={isError}
            refetch={refetch}
            emptyMessage={emptyMessage}
          />
        </div>
      </div>
    </div>
  );
}
