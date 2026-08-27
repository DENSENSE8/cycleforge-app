'use client';

import { useQuery } from '@tanstack/react-query';
import type {
  CatalogByItemNumberCandidate,
  ResolveCatalogByItemNumberResult,
} from '@/lib/packing/resolve-catalog-by-item-number';

export type ByItemNumberApiResult =
  | ({ success: true } & ResolveCatalogByItemNumberResult)
  | { success: false; error: string };

export type { CatalogByItemNumberCandidate };

/**
 * Resolve an item number (or explicit catalog id) to the checklist-owning
 * sku_catalog row. Disabled until a query string is present.
 */
export function useResolveCatalogByItemNumber(args: {
  itemNumber?: string | null;
  catalogId?: number | null;
  enabled?: boolean;
}) {
  const itemNumber = (args.itemNumber || '').trim();
  const catalogId =
    typeof args.catalogId === 'number' && Number.isFinite(args.catalogId) && args.catalogId > 0
      ? args.catalogId
      : null;
  const enabled =
    (args.enabled ?? true) && (catalogId != null || itemNumber.length > 0);

  return useQuery<ByItemNumberApiResult>({
    queryKey: ['sku-catalog-by-item-number', itemNumber || null, catalogId],
    enabled,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (itemNumber) params.set('itemNumber', itemNumber);
      if (catalogId != null) params.set('catalogId', String(catalogId));
      const res = await fetch(`/api/sku-catalog/by-item-number?${params.toString()}`, {
        cache: 'no-store',
      });
      const json = (await res.json()) as ByItemNumberApiResult;
      if (!res.ok || !json.success) {
        throw new Error(
          !json.success && 'error' in json ? json.error : 'Failed to resolve item number',
        );
      }
      return json;
    },
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
}
