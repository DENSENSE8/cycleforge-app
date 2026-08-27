'use client';

/**
 * Labels-station attention strip — Band 2 flush KPIs for Queue / Recent on
 * `/shipping` labels. Same band density as OutboundKpiStrip.
 */

import { useMemo } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  KpiTile,
  OpsKpiBand,
  OpsKpiBandCell,
  OpsKpiBandError,
  OpsKpiBandSkeletonTile,
} from '@/design-system/components/monitor';
import { awaitingLabelsQuery, stagedOrdersQuery } from '@/lib/queries/outbound-queries';
import { toPSTDateKey } from '@/utils/date';
import type { LabelsWorkspaceTab } from '@/utils/labels-workspace-state';
import type { ShippedOrder } from '@/lib/neon/orders-queries';

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

function StripSkeleton({ slots }: { slots: number }) {
  return (
    <OpsKpiBand density="band" className="animate-pulse" aria-label="Loading labels metrics">
      <span className="sr-only">Loading labels metrics…</span>
      {Array.from({ length: slots }).map((_, i) => (
        <OpsKpiBandCell key={i} density="band">
          <OpsKpiBandSkeletonTile density="band" />
        </OpsKpiBandCell>
      ))}
    </OpsKpiBand>
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
    return (
      <OpsKpiBandError
        density="band"
        message="Couldn't load labels metrics."
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (query.isPending) return <StripSkeleton slots={slots} />;
  return (
    <OpsKpiBand density="band" aria-label="Labels attention metrics">
      {tiles.map((t) => (
        <OpsKpiBandCell key={t.id} density="band">
          <KpiTile
            density="band"
            label={t.label}
            value={t.value}
            valueClassName={t.value > 0 ? toneClass(t.tone) : undefined}
            className="h-full"
          />
        </OpsKpiBandCell>
      ))}
    </OpsKpiBand>
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
