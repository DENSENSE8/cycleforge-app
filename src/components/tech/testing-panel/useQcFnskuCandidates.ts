'use client';

/**
 * The /test label band's FNSKU candidates: every active `fba_fnskus` row
 * paired to the open line's catalog SKU. The chip and the Pass press read the
 * same query (one fetch per line open); pairing invalidates it, so both flip
 * to the new resolution together. Preloads the FNSKU label renderer (bwip-js)
 * whenever a print could fire, so the press never waits on a chunk.
 */

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { QcFnskuCandidate } from '@/lib/qc/fnsku-pairing';

export const QC_FNSKU_CANDIDATES_KEY = 'qc-fnsku-candidates';

export async function fetchQcFnskuCandidates(
  params: { skuCatalogId?: number | null; q?: string; title?: string } = {},
): Promise<QcFnskuCandidate[]> {
  const search = new URLSearchParams();
  if (params.skuCatalogId != null && params.skuCatalogId > 0) {
    search.set('sku_catalog_id', String(params.skuCatalogId));
  }
  const q = (params.q ?? '').trim();
  if (q) search.set('q', q);
  const title = (params.title ?? '').trim();
  if (title) search.set('title', title);
  const res = await fetch(`/api/qc/fnsku-candidates?${search.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`FNSKU candidates failed (${res.status})`);
  const data = (await res.json()) as { ok: boolean; candidates?: QcFnskuCandidate[] };
  if (!data.ok) throw new Error('FNSKU candidates failed');
  return data.candidates ?? [];
}

export function useQcFnskuCandidates(row: Pick<ReceivingLineRow, 'id' | 'sku_catalog_id'>) {
  const skuCatalogId = row.sku_catalog_id ?? null;
  const query = useQuery({
    queryKey: [QC_FNSKU_CANDIDATES_KEY, 'line', row.id, skuCatalogId],
    queryFn: () => fetchQcFnskuCandidates({ skuCatalogId }),
    enabled: skuCatalogId != null && skuCatalogId > 0,
  });
  const candidates = query.data ?? [];
  useEffect(() => {
    // Dynamic on purpose (same as printFnskuStationJob): a static import
    // would put bwip-js (~250 KB gz) on every desk page that mounts a composer.
    if (candidates.length > 0) void import('@/lib/print/fnskuLabel');
  }, [candidates.length]);

  return { ...query, candidates };
}
