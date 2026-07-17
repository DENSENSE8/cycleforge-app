'use client';

/**
 * Sales rollup strip — the front-desk "what did the counter do" header, stacked
 * ABOVE the transaction feed.
 *
 * Archetype: **Monitor** — read-only, org-scoped, no durable selection. It
 * composes the house KPI anatomy (`KpiTile` from `@/design-system/components/
 * monitor`) — the SAME eyebrow → hero → footer shape as `OutboundKpiStrip` and
 * `OperationsAnalyticsView`, never a second tile language.
 *
 * The rollup is derived from the SAME rows the feed renders
 * (`summarizeTransactions`), so the heroes can never disagree with the list
 * underneath — chrome never invents a second story. It therefore reflects the
 * ACTIVE category: on Sales the heroes describe sales, not the whole counter.
 */

import { KpiTile, MONITOR_KPI_TILE_CLASS } from '@/design-system/components/monitor';
import { formatDateKeyMedium } from '@/utils/date';
import type { TransactionRollup } from '@/lib/walk-in/transactions';
import { cn } from '@/utils/_cn';

/** Shared band geometry — live strip and skeleton use it so settle is zero-CLS. */
const TILE_BAND_CLASS = 'flex flex-wrap gap-3';
const TILE_CELL_CLASS = 'min-w-0 grow basis-40';

function SkeletonKpiTile() {
  return (
    <div className={cn(MONITOR_KPI_TILE_CLASS, 'h-full')}>
      <div className="h-2.5 w-16 rounded-full bg-surface-strong" />
      <div className="mt-2 h-7 w-14 rounded bg-surface-strong" />
      <div className="mt-2.5 h-2.5 w-20 rounded-full bg-surface-strong" />
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
      <section aria-label="Transaction rollup" className="shrink-0">
        <div className={cn(TILE_BAND_CLASS, 'animate-pulse')} aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading transaction rollup…</span>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={TILE_CELL_CLASS}>
              <SkeletonKpiTile />
            </div>
          ))}
        </div>
      </section>
    );
  }

  const latestDayLabel = rollup.latestDayKey
    ? formatDateKeyMedium(rollup.latestDayKey, { weekday: 'none' })
    : null;

  const tiles = [
    { id: 'count', label, value: rollup.count, footer: undefined },
    { id: 'gross', label: 'Gross', value: rollup.gross, footer: undefined },
    {
      id: 'latest',
      label: 'Latest day',
      value: rollup.latestDayCount,
      footer: latestDayLabel ? (
        <span className="mt-1.5 inline-flex items-center text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
          {latestDayLabel}
        </span>
      ) : undefined,
    },
  ];

  return (
    <section aria-label="Transaction rollup" className="shrink-0">
      <div className={TILE_BAND_CLASS}>
        {tiles.map((tile) => (
          <div key={tile.id} className={TILE_CELL_CLASS}>
            <KpiTile label={tile.label} value={tile.value} footer={tile.footer} className="h-full" />
          </div>
        ))}
      </div>
    </section>
  );
}
