'use client';

/**
 * URL SoT for new-order entry (`?new=true`) on the current workbench path.
 * Shared by Labels / Pack / `/test` Shipping overlays; Dashboard wires the
 * same param via {@link useDashboardSearchController}.
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export function useNewOrderParam() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const newOpen = useMemo(() => searchParams.get('new') === 'true', [searchParams]);

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      const base = pathname || '/';
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const openNew = useCallback(() => {
    replaceParams((params) => params.set('new', 'true'));
  }, [replaceParams]);

  const closeNew = useCallback(() => {
    replaceParams((params) => params.delete('new'));
  }, [replaceParams]);

  return { newOpen, openNew, closeNew };
}
