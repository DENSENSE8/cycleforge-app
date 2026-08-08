'use client';

/**
 * Repair `?new=true` one-shot pulse — paints intake open in the click commit,
 * then strips the param (URL is a trigger, not sticky overlay state).
 *
 * Header + sidebar are separate trees → `shareKey`.
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useOptimisticUrlParam } from '@/hooks/useOptimisticUrlParam';

export function useRepairNewParam(): {
  newPulse: boolean;
  openNew: () => void;
  /** Clear the URL pulse after local intake has opened. */
  clearPulse: () => void;
} {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlNew = useMemo(
    () => searchParams.get('new') === 'true',
    [searchParams],
  );

  const replace = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      const base = pathname || '/repair';
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const write = useCallback((params: URLSearchParams, next: boolean) => {
    if (next) params.set('new', 'true');
    else params.delete('new');
  }, []);

  const { value, setValue } = useOptimisticUrlParam<boolean>({
    urlValue: urlNew,
    replace,
    write,
    shareKey: 'repair:new',
  });

  const openNew = useCallback(() => setValue(true), [setValue]);
  const clearPulse = useCallback(() => setValue(false), [setValue]);

  return { newPulse: value, openNew, clearPulse };
}
