'use client';

import { useQuery } from '@tanstack/react-query';
import type { PackingReportRow } from '@/lib/packing/packing-report-shared';

type PackingItemsResponse = {
  ok: boolean;
  rows: PackingReportRow[];
};

async function safeJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Today's packing report rows (JSON) for By item transparency. */
export function usePackingKpiItems(day?: string) {
  return useQuery<PackingItemsResponse | null>({
    queryKey: ['packing-kpi-items', day ?? 'today'],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const sp = new URLSearchParams({ format: 'json' });
      if (day) sp.set('day', day);
      return await safeJson<PackingItemsResponse>(`/api/packing/reports/export?${sp.toString()}`);
    },
  });
}
