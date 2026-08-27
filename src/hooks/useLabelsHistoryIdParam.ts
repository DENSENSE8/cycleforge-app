'use client';

/**
 * Labels / unit history `?historyId=` paint-pending — recent rail, history
 * finder, and UnitDetailWorkspace share one pending via `shareKey`.
 */

import { startTransition, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOptimisticUrlParam } from '@/hooks/useOptimisticUrlParam';

const PRODUCTS_PATH = '/products';

export function useLabelsHistoryIdParam(): {
  historyId: string | null;
  /** Open/clear unit; optional `labelsView` stamps recent|history on replace. */
  setHistoryId: (next: string | null, labelsView?: 'recent' | 'history') => void;
} {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlHistoryId = useMemo(
    () => searchParams.get('historyId') || null,
    [searchParams],
  );

  const replace = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.replace(qs ? `${PRODUCTS_PATH}?${qs}` : `${PRODUCTS_PATH}?view=labels`, {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  const write = useCallback((params: URLSearchParams, next: string | null) => {
    if (next) params.set('historyId', next);
    else params.delete('historyId');
  }, []);

  const { value, setValue, paint } = useOptimisticUrlParam<string | null>({
    urlValue: urlHistoryId,
    replace,
    write,
    shareKey: 'labels:historyId',
  });

  const setHistoryId = useCallback(
    (next: string | null, labelsView?: 'recent' | 'history') => {
      if (!labelsView) {
        setValue(next);
        return;
      }
      paint(next);
      startTransition(() => {
        replace((params) => {
          params.set('view', 'labels');
          params.set('labelsView', labelsView);
          if (labelsView === 'recent') params.delete('q');
          write(params, next);
        });
      });
    },
    [setValue, paint, replace, write],
  );

  return { historyId: value, setHistoryId };
}
