'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Package } from '@/components/Icons';
import { EmptyState } from '@/design-system/primitives';
import {
  ALLOCATION_REASON_LABELS,
  CHANNEL_DISPOSITION_LABELS,
  type AllocationHit,
  type ChannelDisposition,
} from '@/lib/channel-allocation';
import { conditionLabel } from '@/lib/conditions';
import { velocityTierMeta } from '@/lib/velocity-tier-tone';
import { formatDateTimePST } from '@/utils/date';
import { fbaOutboundHref } from '@/lib/fba/fba-modes';
import Link from 'next/link';
import { cn } from '@/utils/_cn';

async function fetchReadyQueue(q: string): Promise<AllocationHit[]> {
  const sp = new URLSearchParams();
  if (q.trim()) sp.set('q', q.trim());
  sp.set('limit', '200');
  const res = await fetch(`/api/outbound/ready-queue?${sp.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load ready queue');
  const json = (await res.json()) as { ok?: boolean; hits?: AllocationHit[] };
  return json.hits ?? [];
}

function dispositionChipClass(d: ChannelDisposition): string {
  if (d === 'FBA') return 'bg-violet-50 text-violet-700 ring-violet-200';
  if (d === 'HOLD') return 'bg-amber-50 text-amber-800 ring-amber-200';
  return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
}

export function ReadyQueueTable({ searchQuery }: { searchQuery: string }) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['outbound-ready-queue', searchQuery],
    queryFn: () => fetchReadyQueue(searchQuery),
    staleTime: 15_000,
  });

  const hits = data ?? [];

  const counts = useMemo(() => {
    const c = { FBA: 0, PREBOX_STOCK: 0, HOLD: 0 };
    for (const h of hits) c[h.disposition] += 1;
    return c;
  }, [hits]);

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface-card">
        <Loader2 className="h-6 w-6 animate-spin text-text-faint" />
        <span className="ml-2 text-role-caption font-semibold text-text-soft">Loading ready queue…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center">
          <p className="text-sm font-bold text-rose-700">Could not load ready queue</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 text-role-caption font-black uppercase tracking-widest text-rose-600 underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (hits.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-canvas p-6">
        <EmptyState
          icon={<Package className="h-6 w-6 text-text-faint" />}
          title="No units ready for allocation"
          description="Units land here after testing passes (TESTED / GRADED). They sort into FBA prep or pre-box & stock."
          action={
            <Link
              href={fbaOutboundHref()}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-accent-bg px-4 text-role-data font-semibold text-text-inverse shadow-sm transition-colors hover:bg-accent-bg/90"
            >
              Open FBA prep
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface-canvas">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1440px] min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border-soft bg-surface-card/95 px-4 py-4 sm:px-6 lg:px-8">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
            Ready queue · {hits.length}
            {isFetching ? ' · updating…' : ''}
          </p>
          <div className="h-4 w-px shrink-0 bg-border-hairline" aria-hidden />
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {(
              [
                ['FBA', counts.FBA],
                ['PREBOX_STOCK', counts.PREBOX_STOCK],
                ['HOLD', counts.HOLD],
              ] as const
            ).map(([d, n]) =>
              n > 0 ? (
                <span
                  key={d}
                  className={cn(
                    'rounded px-1.5 py-0.5 text-role-micro uppercase tracking-widest ring-1 ring-inset',
                    dispositionChipClass(d),
                  )}
                >
                  {CHANNEL_DISPOSITION_LABELS[d]} {n}
                </span>
              ) : null,
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 pb-8 pt-3 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-2xl border border-border-soft bg-surface-card shadow-sm">
            <table className="min-w-full border-collapse">
              <thead className="sticky top-0 z-10 bg-surface-card">
                <tr className="border-b border-border-soft text-left text-role-micro uppercase tracking-widest text-text-soft">
                  <th className="px-3 py-3">Title</th>
                  <th className="px-3 py-3">Disposition</th>
                  <th className="px-3 py-3">Reasons</th>
                  <th className="px-3 py-3">Velocity</th>
                  <th className="px-3 py-3">Condition</th>
                  <th className="px-3 py-3">Tested</th>
                  <th className="px-3 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-hairline bg-surface-card">
                {hits.map((hit) => (
                  <ReadyRow key={`${hit.entityType}-${hit.entityId}`} hit={hit} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReadyRow({ hit }: { hit: AllocationHit }) {
  const tierMeta = hit.velocityTier ? velocityTierMeta(hit.velocityTier) : null;
  const testedLabel = hit.testedAt ? formatDateTimePST(hit.testedAt) : '—';
  const cond = hit.conditionGrade ? conditionLabel(hit.conditionGrade, 'table') : '—';

  return (
    <tr className="hover:bg-gray-50">
      <td className="max-w-[280px] px-3 py-3">
        <p className="truncate text-role-caption font-bold text-gray-900">{hit.title || hit.sku || `Unit #${hit.entityId}`}</p>
        <p className="truncate text-role-eyebrow font-semibold uppercase tracking-widest text-gray-500">
          {[hit.sku, hit.fnsku, hit.asin].filter(Boolean).join(' · ') || `id ${hit.entityId}`}
        </p>
      </td>
      <td className="px-3 py-3">
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-role-micro uppercase tracking-widest ring-1 ring-inset',
            dispositionChipClass(hit.disposition),
          )}
        >
          {CHANNEL_DISPOSITION_LABELS[hit.disposition]}
        </span>
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-1">
          {hit.reasons.map((r) => (
            <span
              key={r}
              className="rounded bg-gray-50 px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-widest text-gray-600 ring-1 ring-inset ring-gray-200"
            >
              {ALLOCATION_REASON_LABELS[r]}
            </span>
          ))}
        </div>
      </td>
      <td className="px-3 py-3">
        {tierMeta ? (
          <span className={cn('rounded px-1.5 py-0.5 text-role-micro uppercase tracking-widest ring-1 ring-inset ring-border-soft', tierMeta.ring)}>
            {tierMeta.label}
          </span>
        ) : (
          <span className="text-role-caption text-text-faint">—</span>
        )}
      </td>
      <td className="px-3 py-3 text-role-caption font-semibold text-text-soft">{cond}</td>
      <td className="px-3 py-3 text-role-caption text-text-soft tabular-nums">{testedLabel}</td>
      <td className="px-3 py-3">
        {hit.disposition === 'FBA' ? (
          <Link
            href={fbaOutboundHref()}
            className="text-role-caption font-black uppercase tracking-widest text-violet-700 hover:underline"
          >
            Stage FBA
          </Link>
        ) : hit.disposition === 'PREBOX_STOCK' ? (
          <span className="text-role-caption font-black uppercase tracking-widest text-emerald-700">
            Pre-box & stock
          </span>
        ) : (
          <span className="text-role-caption font-black uppercase tracking-widest text-amber-700">Hold</span>
        )}
      </td>
    </tr>
  );
}
