'use client';

/**
 * `GET /api/packing/reports/export?format=json` — WHAT was packed, for a day
 * and (optionally) ONE packer.
 *
 * This is the drill-down half of the packer report: the KPI summary
 * (`use-packing-kpi.ts`) answers *how much*, these rows answer *what* — every
 * pack scan with its packed-at time, item number, SKU, product title, the
 * tracking / scan ref that identifies the order, and the time-to-pack standard
 * the pack was weighted at, plus whether that standard came from a human
 * (`profile`) or from the title rules.
 *
 * Lives in `src/lib` rather than `features/operations/workspace` because the
 * PHONE owns the manager read (`/m/reports` → Packing → tap a packer) and `/m`
 * may not import feature dirs. One hook, one query key, so the desk By-item
 * table and the phone sheet cannot disagree about a shift.
 *
 * `packerId` is part of the KEY, not a client-side filter: the endpoint already
 * narrows by packer, and filtering a whole day's rows in the browser to show
 * one packer would fetch the same data twice under one key.
 */

import { useQuery } from '@tanstack/react-query';
import type { PackingReportRow } from '@/lib/packing/packing-report-shared';

export type PackingItemsResponse = {
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

export function usePackingReportRows(
  day?: string,
  packerId?: number | null,
  options?: { enabled?: boolean },
) {
  return useQuery<PackingItemsResponse | null>({
    queryKey: ['packing-kpi-items', day ?? 'today', packerId ?? 'all'],
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const sp = new URLSearchParams({ format: 'json' });
      if (day) sp.set('day', day);
      if (packerId != null) sp.set('packerId', String(packerId));
      return await safeJson<PackingItemsResponse>(`/api/packing/reports/export?${sp.toString()}`);
    },
  });
}
