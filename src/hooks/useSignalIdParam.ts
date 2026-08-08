'use client';

/**
 * Operations Signals browse `?signalId=` paint-pending.
 */

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOptimisticUrlParam } from '@/hooks/useOptimisticUrlParam';
import { replaceOperationsSignalsUrl } from '@/features/signals/signals-url';

function parseSignalId(raw: string | null): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function useSignalIdParam(): {
  signalId: number | null;
  setSignalId: (next: number | null) => void;
} {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlSignalId = useMemo(
    () => parseSignalId(searchParams.get('signalId')),
    [searchParams],
  );

  const replace = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      replaceOperationsSignalsUrl(router, searchParams, (sp) => {
        sp.set('signalsView', 'browse');
        mutate(sp);
      });
    },
    [router, searchParams],
  );

  const write = useCallback((params: URLSearchParams, next: number | null) => {
    if (next != null && next > 0) params.set('signalId', String(next));
    else params.delete('signalId');
  }, []);

  const { value, setValue } = useOptimisticUrlParam<number | null>({
    urlValue: urlSignalId,
    replace,
    write,
  });

  return { signalId: value, setSignalId: setValue };
}
