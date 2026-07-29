'use client';

/**
 * The Sales transaction feed — day-banded rows for the merged front-desk history.
 *
 * Composes the house table language end to end: `DateGroupHeader` day bands,
 * `groupRowsBy` for the buckets, `RowTitle` for the dot+title (fixed dot track,
 * so titles start at the same x on every row), `LedgerValue` for money, and the
 * shared `dashboardOrderRowShellClass` grid. Full-bleed inside the workbench
 * gutter column — the table is never wrapped in a card (workbench-shell.tsx).
 *
 * Every per-kind label / hue resolves through `transaction-kind.ts`; this view
 * assembles resolved facts and decides nothing.
 */

import { Fragment } from 'react';
import { DateGroupHeader } from '@/components/ui/DateGroupHeader';
import { RowTitle, META_COL } from '@/components/ui/RowMetaColumns';
import { LedgerValue } from '@/design-system/components/LedgerValue';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/design-system/primitives';
import { RefreshCw } from '@/components/Icons';
import { groupRowsBy } from '@/lib/group-rows';
import { dashboardOrderRowShellClass } from '@/lib/dashboard-order-row-layout';
import { transactionKindMeta } from '@/lib/walk-in/transaction-kind';
import type { WalkInTransaction } from '@/lib/walk-in/transactions';
import { cn } from '@/utils/_cn';

function TransactionRow({ row }: { row: WalkInTransaction }) {
  const kind = transactionKindMeta(row.kind);

  return (
    <div
      className={cn(
        dashboardOrderRowShellClass(false),
        'border-b border-border-hairline/80 px-3 py-1.5 hover:bg-surface-hover',
      )}
    >
      <div className="flex min-w-0 flex-col">
        <RowTitle dot={kind.dot} dotTitle={kind.label} dotTooltip title={row.customer} small />
        {/* Meta indents by the RowTitle dot-track width so it lines up under the
            title text, not under the dot (the META_COL invariant). */}
        <div
          className="mt-0.5 flex min-w-0 items-center gap-1.5 text-role-eyebrow uppercase text-text-soft"
          style={{ paddingLeft: META_COL.indent }}
        >
          <span className="shrink-0 font-semibold tracking-widest">{kind.label}</span>
          <span aria-hidden className="text-text-faint">
            ·
          </span>
          <span className="truncate">{row.detail}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <LedgerValue value={row.amountLabel} variant="number" />
        <span className="w-24 truncate text-right text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
          {row.status}
        </span>
      </div>
    </div>
  );
}

export function SalesTransactionsFeed({
  rows,
  isLoading,
  isError,
  refetch,
  emptyMessage,
}: {
  rows: WalkInTransaction[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  emptyMessage: string;
}) {
  if (isLoading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center gap-2 text-role-caption text-text-soft">
        <LoadingSpinner size="lg" className="text-emerald-600" />
      </div>
    );
  }

  // Every spine failed — a retryable box, never a silent blank feed.
  if (isError) {
    return (
      <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-8 text-center">
        <p className="text-role-caption font-semibold text-rose-700">
          Couldn&apos;t load the transaction history.
        </p>
        <Button type="button" variant="secondary" size="sm" className="mt-2 gap-1.5" onClick={refetch}>
          <RefreshCw className="h-3.5 w-3.5" /> Try again
        </Button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-soft bg-surface-card px-4 py-10 text-center">
        <p className="text-role-caption text-text-faint">{emptyMessage}</p>
      </div>
    );
  }

  // Rows arrive newest-first, so first-seen day order IS the display order.
  const days = groupRowsBy(rows, (row) => row.dateKey);

  return (
    <div className="flex min-w-0 flex-col">
      {days.map((day) => (
        <Fragment key={day.key || 'undated'}>
          <DateGroupHeader date={day.key} total={day.rows.length} />
          {day.rows.map((row) => (
            <TransactionRow key={row.key} row={row} />
          ))}
        </Fragment>
      ))}
    </div>
  );
}
