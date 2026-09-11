'use client';

/**
 * Batch-loads kit compositions for visible order rows (sku_catalog_id → composition).
 * Prefer sku_relationships; fall back to sku_kit_parts; never Zoho `-P`.
 *
 * Callers: useOrdersSpreadsheet → OrdersQueueTableRow kitFace.
 * API: POST /api/sku-catalog/composition/batch.
 * User: Implement multi-tenant kit / bundle display (Shopify-like).
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  kitFaceFromComposition,
  type KitComposition,
  type KitFace,
} from '@/lib/orders/order-kit-composition';

type BatchEntry = {
  composition: KitComposition;
  source: 'sku_relationships' | 'sku_kit_parts' | 'none';
};

const EMPTY_MAP: ReadonlyMap<number, KitComposition> = new Map();

export function catalogIdsFromOrderRecords(
  records: readonly { sku_catalog_id?: number | null }[],
): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const row of records) {
    const id = Number(row.sku_catalog_id);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.sort((a, b) => a - b);
}

export function useKitCompositionMap(catalogIds: readonly number[]) {
  const sortedKey = useMemo(() => [...catalogIds].sort((a, b) => a - b).join(','), [catalogIds]);
  const ids = useMemo(
    () =>
      sortedKey
        ? sortedKey.split(',').map((s) => Number(s)).filter((n) => Number.isFinite(n) && n > 0)
        : [],
    [sortedKey],
  );

  return useQuery({
    queryKey: ['kit-composition-batch', sortedKey],
    enabled: ids.length > 0,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Map<number, KitComposition>> => {
      const res = await fetch('/api/sku-catalog/composition/batch', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error('Failed to load kit compositions');
      const data = (await res.json()) as {
        success?: boolean;
        byId?: Record<string, BatchEntry>;
      };
      if (!data?.success || !data.byId) throw new Error('Failed to load kit compositions');
      const map = new Map<number, KitComposition>();
      for (const [key, entry] of Object.entries(data.byId)) {
        const id = Number(key);
        if (!Number.isFinite(id) || !entry?.composition) continue;
        map.set(id, entry.composition);
      }
      return map;
    },
  });
}

export function kitFaceForCatalogId(
  map: ReadonlyMap<number, KitComposition> | undefined,
  skuCatalogId: number | null | undefined,
): KitFace | null {
  const id = Number(skuCatalogId);
  if (!map || !Number.isFinite(id) || id <= 0) return null;
  return kitFaceFromComposition(map.get(id));
}

export function emptyKitCompositionMap(): ReadonlyMap<number, KitComposition> {
  return EMPTY_MAP;
}
