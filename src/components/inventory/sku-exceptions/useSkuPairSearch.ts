'use client';

/**
 * The state behind pairing a floor-minted `TMP-` SKU into its permanent
 * catalog SKU — shared by the SKU exception's Pair group and the stock
 * record's Pair to SKU sheet so both search, pick and merge the same way.
 * The merge (`merge-placeholder`) moves stock, photos and description onto
 * the permanent SKU and deletes the temporary one.
 */

import { useMemo, useState } from 'react';
import { useDebounce } from '@/hooks';
import { useResolvePairsException } from '@/hooks/exceptions';
import { useSkuCatalogSearch, type SkuCatalogItem } from '@/hooks/useSkuCatalogSearch';
import { isProvisionalSku } from '@/lib/inventory/provisional-sku';
import type { ProvisionalSkuDetail } from '@/lib/neon/provisional-sku-queries';
import { toast } from '@/lib/toast';

export interface SkuPairOption {
  value: string;
  label: string;
  meta?: string;
  data: SkuCatalogItem;
}

export function useSkuPairSearch(item: ProvisionalSkuDetail) {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<SkuCatalogItem | null>(null);
  const merge = useResolvePairsException();

  // Seeded with the typed name: the likeliest real SKU is whatever the catalog
  // already calls the thing the operator described.
  const effectiveQuery = useDebounce((query || item.productTitle).trim(), 250);
  const search = useSkuCatalogSearch(effectiveQuery, { limit: 20, searchField: 'catalog' });
  const hits = useMemo(
    // A placeholder cannot merge into itself, and TMP→TMP is refused by the endpoint.
    () => (search.data ?? []).filter((hit) => hit.sku !== item.sku && !isProvisionalSku(hit.sku)),
    [item.sku, search.data],
  );
  // Results refresh as the query changes; the chosen destination stays listed
  // even when the current query no longer matches it.
  const options = useMemo((): SkuPairOption[] => {
    const choices = chosen && !hits.some((hit) => hit.sku === chosen.sku) ? [chosen, ...hits] : hits;
    return choices.map((hit) => ({ value: hit.sku, label: hit.sku, meta: hit.product_title || undefined, data: hit }));
  }, [chosen, hits]);

  const choose = (sku: string | number | null) => {
    setChosen(options.find((option) => option.value === sku)?.data ?? null);
  };

  const pair = (onPaired: () => void | Promise<void>) => {
    if (!chosen || merge.isPending) return;
    const target = chosen.sku;
    merge.mutate(
      { action: 'merge-placeholder', provisionalSku: item.sku, targetSku: target },
      {
        onSuccess: () => {
          toast.success(`Paired ${item.sku} into ${target}`);
          void onPaired();
        },
        onError: (error) => toast.error(error.message || 'Could not pair.'),
      },
    );
  };

  return {
    query,
    setQuery,
    chosen,
    choose,
    options,
    searching: search.isFetching,
    busy: merge.isPending,
    pair,
  };
}
