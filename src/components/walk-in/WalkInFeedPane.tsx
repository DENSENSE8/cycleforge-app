'use client';

/**
 * Flush feed pane — the shared body for the Sales-hub modes that render a
 * day-banded transaction feed (Local Pickup · Sales), flush in
 * `WORKBENCH_SHEET_HOST` (no framed padded-card island).
 *
 * **No history dock here, deliberately** (2026-08-29). Every scan station got a
 * leftmost history dock so an operator can answer "did that scan land?" without
 * leaving what they are doing — but on this desk the day-banded feed IS that
 * answer, and it is already the primary surface. A dock beside it would render
 * the same rows twice, a foot apart.
 *
 * The KPI strip that sat above this feed was removed with every other
 * table-workbench KPI band (`docs/todo/one-sheet-table-sot-PLAN.md` § 3.5).
 *
 * Repair mode does NOT use this — it mounts `RepairTable`, which owns its own
 * boxed pane + richer row/detail model.
 */

import { useMemo } from 'react';
import { WORKBENCH_SHEET_HOST } from '@/components/dashboard/workbench-shell';
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
