'use client';

/**
 * Sales rollup strip — the front-desk "what did the counter do" header, stacked
 * ABOVE the transaction feed.
 *
 * Archetype: **Monitor** — read-only, org-scoped, no durable selection. It
 * composes the house KPI anatomy (`KpiTile` from `@/design-system/components/
 * monitor`) — the SAME eyebrow + compact delta (top-right) → hero shape as
 * `OutboundKpiStrip` and `OperationsAnalyticsView`, never a second tile language.
 *
 * The rollup is derived from the SAME rows the feed renders
 * (`summarizeTransactions`), so the heroes can never disagree with the list
 * underneath — chrome never invents a second story. It therefore reflects the
 * ACTIVE category: on Sales the heroes describe sales, not the whole counter.
 */

import {
  KpiTile,
  MONITOR_KPI_TILE_CLASS,
  OpsKpiBand,
  OpsKpiBandCell,
} from '@/design-system/components/monitor';
import { formatDateKeyMedium } from '@/utils/date';
import type { TransactionRollup } from '@/lib/walk-in/transactions';
import { cn } from '@/utils/_cn';

function SkeletonKpiTile() {
  return (
    <div className={cn(MONITOR_KPI_TILE_CLASS, 'h-full')}>
      <div className="flex items-start justify-between gap-3">
        <div className="h-2.5 w-16 rounded-full bg-surface-strong" />
        <div className="h-2.5 w-8 rounded-full bg-surface-strong" />
      </div>
      <div className="mt-2 h-7 w-14 rounded bg-surface-strong" />
    </div>
  );
}

export function SalesKpiStrip({
  rollup,
  isLoading,
  label,
}: {
  rollup: TransactionRollup;
  isLoading: boolean;
  /** What the heroes describe — the active category ("All transactions", "Sales", …). */
  label: string;
}) {
  if (isLoading) {
    return (
      <section
        aria-label="Transaction rollup"
        aria-busy="true"
        aria-live="polite"
        className="shrink-0"
      >
        <OpsKpiBand className="animate-pulse" aria-label="Loading transaction rollup">
          <span className="sr-only">Loading transaction rollup…</span>
          {Array.from({ length: 3 }).map((_, i) => (
            <OpsKpiBandCell key={i}>
              <SkeletonKpiTile />
            </OpsKpiBandCell>
          ))}
        </OpsKpiBand>
      </section>
    );
  }

  const latestDayLabel = rollup.latestDayKey
    ? formatDateKeyMedium(rollup.latestDayKey, { weekday: 'none' })
    : null;

  const tiles = [
    { id: 'count', label, value: rollup.count },
    { id: 'gross', label: 'Gross', value: rollup.gross },
    {
      id: 'latest',
      label: latestDayLabel ? `Latest · ${latestDayLabel}` : 'Latest day',
      value: rollup.latestDayCount,
    },
  ];

  return (
    <section aria-label="Transaction rollup" className="shrink-0">
      <OpsKpiBand aria-label="Transaction rollup">
        {tiles.map((tile) => (
          <OpsKpiBandCell key={tile.id}>
            <KpiTile label={tile.label} value={tile.value} className="h-full" />
          </OpsKpiBandCell>
        ))}
      </OpsKpiBand>
    </section>
  );
}
