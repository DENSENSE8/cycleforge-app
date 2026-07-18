'use client';

/**
 * Boxed feed pane — the shared body for the Sales-hub modes that render a
 * day-banded transaction feed (Local Pickup · Sales). It composes the house
 * primitives end to end: a fixed `SalesKpiStrip` band over a `WorkbenchTablePane`
 * (the sanctioned "was full-bleed → padded/boxed" monitor card, same shell
 * `RepairTable` uses) whose inner scroll region holds `SalesTransactionsFeed`.
 *
 * KPI is derived from the SAME rows the feed renders (`summarizeTransactions`),
 * so the hero can never disagree with the table under it.
 *
 * Repair mode does NOT use this — it mounts `RepairTable`, which owns its own
 * boxed pane + richer row/detail model.
 */

import { useMemo } from 'react';
import { WORKBENCH_GUTTERS, WorkbenchTablePane } from '@/components/dashboard/workbench-shell';
import { SalesKpiStrip } from '@/components/walk-in/SalesKpiStrip';
import { SalesTransactionsFeed } from '@/components/walk-in/SalesTransactionsFeed';
import { summarizeTransactions, type WalkInTransaction } from '@/lib/walk-in/transactions';
import { cn } from '@/utils/_cn';

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
      <div className={cn(WORKBENCH_GUTTERS, 'shrink-0 pt-4')}>
        <SalesKpiStrip rollup={rollup} isLoading={isLoading} label={label} />
      </div>
      <WorkbenchTablePane>
        {/* The pane's inner shell is overflow-hidden; the scroll lives here so the
            day-band headers dock at top-0 of this region (RepairTable pattern). */}
        <div className="min-h-0 w-full flex-1 overflow-y-auto">
          <SalesTransactionsFeed
            rows={rows}
            isLoading={isLoading}
            isError={isError}
            refetch={refetch}
            emptyMessage={emptyMessage}
          />
        </div>
      </WorkbenchTablePane>
    </div>
  );
}
