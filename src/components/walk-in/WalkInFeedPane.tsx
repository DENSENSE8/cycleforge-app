'use client';

/**
 * Flush feed pane — the shared body for the Sales-hub modes that render a
 * day-banded transaction feed (Local Pickup · Sales). Sheets flush stack (Unbox
 * recipe): a `SalesKpiStrip` Band 2 over the feed flush in `WORKBENCH_SHEET_HOST`
 * (no framed padded-card island). The hub owns Band 1 tabs.
 *
 * KPI is derived from the SAME rows the feed renders (`summarizeTransactions`),
 * so the hero can never disagree with the table under it.
 *
 * Repair mode does NOT use this — it mounts `RepairTable`, which owns its own
 * boxed pane + richer row/detail model.
 */

import { useMemo } from 'react';
import { WORKBENCH_SHEET_HOST } from '@/components/dashboard/workbench-shell';
import { WorkbenchBand2Card } from '@/components/dashboard/workbench-kpi-collapse';
import { SalesKpiStrip } from '@/components/walk-in/SalesKpiStrip';
import { SalesTransactionsFeed } from '@/components/walk-in/SalesTransactionsFeed';
import { summarizeTransactions, type WalkInTransaction } from '@/lib/walk-in/transactions';

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
  const rollup = useMemo(() => summarizeTransactions(rows), [rows]);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-surface-canvas">
      {/* Band 2 — KPI, seated in the flush chrome seam (border-b border-r). */}
      <WorkbenchBand2Card>
        <SalesKpiStrip rollup={rollup} isLoading={isLoading} label={label} />
      </WorkbenchBand2Card>
      {/* Feed flush in the sheet host; the scroll lives here so the day-band
          headers dock at top-0 of this region (RepairTable pattern). */}
      <div className={WORKBENCH_SHEET_HOST}>
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
