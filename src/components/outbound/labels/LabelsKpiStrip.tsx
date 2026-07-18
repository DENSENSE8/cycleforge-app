'use client';

/**
 * Labels-station attention strip — Monitor KPIs for the Queue / Recent facets of
 * the `/outbound` labels station. Same tile anatomy as ShippingKpiStrip; reads
 * the same awaiting-label / staged feeds the tables + tab counts use (React
 * Query dedupes), so nothing drifts.
 */

import { useMemo } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { KpiTile, MONITOR_KPI_TILE_CLASS } from '@/design-system/components/monitor';
import { awaitingLabelsQuery, stagedOrdersQuery } from '@/lib/queries/outbound-queries';
import { toPSTDateKey } from '@/utils/date';
import { RefreshCw } from '@/components/Icons';
import type { LabelsWorkspaceTab } from '@/utils/labels-workspace-state';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { cn } from '@/utils/_cn';

const TILE_BAND_CLASS = 'flex flex-wrap gap-3';
const TILE_CELL_CLASS = 'min-w-0 grow basis-40';

interface Tile {
  id: string;
  label: string;
  value: number;
  tone?: 'warn' | 'bad';
}

function toneClass(tone?: 'warn' | 'bad'): string | undefined {
  if (tone === 'bad') return 'text-text-danger';
  if (tone === 'warn') return 'text-text-warning';
  return undefined;
}

function countCreatedToday(rows: ShippedOrder[]): number {
  const todayKey = toPSTDateKey(new Date());
  let n = 0;
  for (const r of rows) {
    try {
      if (r.created_at && toPSTDateKey(r.created_at) === todayKey) n += 1;
    } catch {
      /* ignore unparseable dates */
    }
  }
  return n;
}

function countOverdue(rows: ShippedOrder[]): number {
  const now = Date.now();
  let n = 0;
  for (const r of rows) {
    const deadline = Date.parse(String(r.deadline_at || ''));
    if (Number.isFinite(deadline) && deadline < now) n += 1;
  }
  return n;
}

function SkeletonTile() {
  return (
    <div className={cn(MONITOR_KPI_TILE_CLASS, 'h-full')}>
      <div className="h-2.5 w-16 rounded-full bg-surface-strong" />
      <div className="mt-2 h-7 w-14 rounded bg-surface-strong" />
    </div>
  );
}

function StripSkeleton({ slots }: { slots: number }) {
  return (
    <div className={cn(TILE_BAND_CLASS, 'animate-pulse')} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading labels metrics…</span>
      {Array.from({ length: slots }).map((_, i) => (
        <div key={i} className={TILE_CELL_CLASS}>
          <SkeletonTile />
        </div>
      ))}
    </div>
  );
}

function StripError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center">
      <p className="text-role-caption font-bold text-rose-700">Couldn&apos;t load labels metrics.</p>
      <button
        type="button"
        onClick={onRetry}
        // ds-raw-button: retry affordance inside a dashed error box (matches ShippingKpiStrip).
        className="mt-2 inline-flex items-center gap-1 rounded-md border border-rose-200 bg-surface-card px-2.5 py-1 text-role-eyebrow uppercase tracking-widest text-rose-700 hover:bg-rose-100"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Try again
      </button>
    </div>
  );
}

function StripLayout({
  query,
  slots,
  tiles,
}: {
  query: UseQueryResult<ShippedOrder[]>;
  slots: number;
  tiles: Tile[];
}) {
  if (query.isError) {
    return <StripError onRetry={() => void query.refetch()} />;
  }
  if (query.isPending) return <StripSkeleton slots={slots} />;
  return (
    <div className={TILE_BAND_CLASS}>
      {tiles.map((t) => (
        <div key={t.id} className={TILE_CELL_CLASS}>
          <KpiTile
            label={t.label}
            value={t.value}
            valueClassName={t.value > 0 ? toneClass(t.tone) : undefined}
            className="h-full"
          />
        </div>
      ))}
    </div>
  );
}

function QueueStrip() {
  const query = useQuery(awaitingLabelsQuery({ searchQuery: '' }));
  const rows = query.data ?? [];
  const tiles = useMemo<Tile[]>(
    () => [
      { id: 'awaiting', label: 'Awaiting label', value: rows.length, tone: 'warn' },
      { id: 'overdue', label: 'Overdue', value: countOverdue(rows), tone: 'bad' },
      { id: 'today', label: 'Added today', value: countCreatedToday(rows) },
    ],
    [rows],
  );
  return <StripLayout query={query} slots={3} tiles={tiles} />;
}

function RecentStrip() {
  const query = useQuery(stagedOrdersQuery({ searchQuery: '' }));
  const rows = query.data ?? [];
  const tiles = useMemo<Tile[]>(
    () => [
      { id: 'ready', label: 'Labeled · ready', value: rows.length },
      { id: 'today', label: 'Labeled today', value: countCreatedToday(rows) },
    ],
    [rows],
  );
  return <StripLayout query={query} slots={2} tiles={tiles} />;
}

export function LabelsKpiStrip({ tab }: { tab: LabelsWorkspaceTab }) {
  return (
    <section aria-label="Labels attention" className="shrink-0">
      {tab === 'queue' ? <QueueStrip /> : <RecentStrip />}
    </section>
  );
}
