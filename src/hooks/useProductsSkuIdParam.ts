'use client';

/**
 * Products Kit/QC `?skuId=` paint-pending — sidebar pickers + workspaces share
 * one pending (`shareKey`) so selection paints in the click commit.
 */

import { startTransition, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOptimisticUrlParam } from '@/hooks/useOptimisticUrlParam';

const PRODUCTS_PATH = '/products';

function parseSkuId(raw: string | null): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function useProductsSkuIdParam(): {
  skuId: number | null;
  /** Open/clear SKU; optional `view` stamps qc|kit on the same replace. */
  setSkuId: (next: number | null, view?: 'qc' | 'kit') => void;
} {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlSkuId = useMemo(
    () => parseSkuId(searchParams.get('skuId')),
    [searchParams],
  );

  const replace = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.replace(qs ? `${PRODUCTS_PATH}?${qs}` : PRODUCTS_PATH, { scroll: false });
    },
    [router, searchParams],
  );

  const write = useCallback((params: URLSearchParams, next: number | null) => {
    if (next != null && next > 0) params.set('skuId', String(next));
    else params.delete('skuId');
  }, []);

  const { value, setValue, paint } = useOptimisticUrlParam<number | null>({
    urlValue: urlSkuId,
    replace,
    write,
    shareKey: 'products:skuId',
  });

  const setSkuId = useCallback(
    (next: number | null, view?: 'qc' | 'kit') => {
      if (!view) {
        setValue(next);
        return;
      }
      paint(next);
      startTransition(() => {
        replace((params) => {
          params.set('view', view);
          write(params, next);
        });
      });
    },
    [setValue, paint, replace, write],
  );

  return { skuId: value, setSkuId };
}
