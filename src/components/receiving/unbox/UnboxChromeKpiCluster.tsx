'use client';

/**
 * Unbox's KPI row — Band 2 Grok-like analytics canvas (time · facets · viz ·
 * charts). Clicking a filterable card still writes `?ukpi=` so
 * `ReceivingLinesTable` narrows via the same predicates in `unbox-metrics`.
 */

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { UnboxKpiCanvas } from './UnboxKpiCanvas';
import { useSurfacePaintMark } from '@/lib/observability/paint-timing';
import type { UnboxWorkspaceTab } from '@/utils/unbox-workspace-state';
import { unboxKpiFeedTab } from '@/utils/unbox-workspace-state';
import type { UnboxKpiMetricCard, UnboxKpiRange, UnboxKpiGranularity } from '@/lib/receiving/unbox-metrics';
import { parseUnboxKpiRange } from '@/lib/receiving/unbox-metrics';

type UnboxKpiFeed = ReturnType<typeof unboxKpiFeedTab>;

type UnboxKpiResponse = {
  success: boolean;
  metrics: UnboxKpiMetricCard[];
  range: UnboxKpiRange;
  granularity: UnboxKpiGranularity;
  mode: UnboxKpiFeed;
};

async function fetchUnboxKpi(args: {
  mode: UnboxKpiFeed;
  urange: string;
  ustage: string | null;
  ulane: string | null;
  staff: string | null;
}): Promise<UnboxKpiResponse> {
  const params = new URLSearchParams({
    mode: args.mode,
    urange: args.urange,
  });
  if (args.ustage) params.set('ustage', args.ustage);
  if (args.ulane) params.set('ulane', args.ulane);
  if (args.staff) params.set('staff', args.staff);
  const res = await fetch(`/api/receiving/unbox-kpi?${params.toString()}`, {
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error(`unbox-kpi ${res.status}`);
  return res.json() as Promise<UnboxKpiResponse>;
}

export function UnboxChromeKpiCluster({ mode }: { mode: UnboxWorkspaceTab }) {
  const searchParams = useSearchParams();
  const feedMode = unboxKpiFeedTab(mode);
  const urange = parseUnboxKpiRange(searchParams.get('urange'));
  const ustage = (searchParams.get('ustage') || '').trim() || null;
  const ulane = (searchParams.get('ulane') || '').trim() || null;
  const staff = (searchParams.get('staff') || '').trim() || null;

  const query = useQuery({
    queryKey: ['unbox-kpi', feedMode, urange, ustage ?? 'all', ulane ?? 'all', staff ?? 'all'],
    queryFn: () =>
      fetchUnboxKpi({
        mode: feedMode,
        urange,
        ustage,
        ulane,
        staff,
      }),
    staleTime: 20_000,
  });

  useSurfacePaintMark('unbox:kpi', !query.isLoading);

  return (
    <UnboxKpiCanvas
      mode={mode}
      metrics={query.data?.metrics ?? []}
      isLoading={query.isLoading}
      isError={query.isError}
      onRetry={() => {
        void query.refetch();
      }}
    />
  );
}
