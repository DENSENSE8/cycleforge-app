'use client';

/** URL SoT for new-order entry (`?new=true`) on the current workbench path. */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useOptimisticUrlParam } from '@/hooks/useOptimisticUrlParam';

export function useNewOrderParam() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlNewOpen = useMemo(
    () => searchParams.get('new') === 'true',
    [searchParams],
  );

  const replace = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      const base = pathname || '/';
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const write = useCallback((params: URLSearchParams, next: boolean) => {
    if (next) params.set('new', 'true');
    else params.delete('new');
  }, []);

  const { value: newOpen, setValue: setNewOpen } = useOptimisticUrlParam<boolean>({
    urlValue: urlNewOpen,
    replace,
    write,
  });

  const openNew = useCallback(() => setNewOpen(true), [setNewOpen]);
  const closeNew = useCallback(() => setNewOpen(false), [setNewOpen]);

  return { newOpen, openNew, closeNew };
}
