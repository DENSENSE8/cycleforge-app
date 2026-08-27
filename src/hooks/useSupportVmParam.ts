'use client';

/**
 * Support voicemail `?vm=` paint-pending — workspace + queue (incl. sidebar)
 * share one pending via `shareKey`.
 */

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOptimisticUrlParam } from '@/hooks/useOptimisticUrlParam';

const SUPPORT_PATH = '/support';

function parseVmId(raw: string | null): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function useSupportVmParam(): {
  vmId: number | null;
  setVm: (next: number | null) => void;
} {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlVm = useMemo(
    () => parseVmId(searchParams.get('vm')),
    [searchParams],
  );

  const replace = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('mode', 'voicemail');
      mutate(params);
      const qs = params.toString();
      router.replace(qs ? `${SUPPORT_PATH}?${qs}` : `${SUPPORT_PATH}?mode=voicemail`, {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  const write = useCallback((params: URLSearchParams, next: number | null) => {
    if (next != null && next > 0) params.set('vm', String(next));
    else params.delete('vm');
  }, []);

  const { value, setValue } = useOptimisticUrlParam<number | null>({
    urlValue: urlVm,
    replace,
    write,
    shareKey: 'support:vm',
  });

  return { vmId: value, setVm: setValue };
}
