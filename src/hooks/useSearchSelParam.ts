'use client';

/**
 * `/search` `?sel=` paint-pending — page + browse shell share one pending so
 * browse→detail swaps in the click commit (not after soft-replace).
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useOptimisticUrlParam } from '@/hooks/useOptimisticUrlParam';
import {
  SEARCH_SEL_PARAM,
  formatSearchSel,
  parseSearchSel,
  type SearchSelection,
} from '@/lib/search/search-selection';

function searchSelEquals(a: SearchSelection | null, b: SearchSelection | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.entityType === b.entityType && a.id === b.id;
}

export function useSearchSelParam(): {
  sel: SearchSelection | null;
  setSel: (next: SearchSelection | null) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const findPath =
    pathname === '/m/search' || pathname.startsWith('/m/search/') ? '/m/search' : '/search';

  const urlSel = useMemo(
    () => parseSearchSel(searchParams.get(SEARCH_SEL_PARAM)),
    [searchParams],
  );

  const replace = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.replace(qs ? `${findPath}?${qs}` : findPath, { scroll: false });
    },
    [findPath, router, searchParams],
  );

  const write = useCallback((params: URLSearchParams, next: SearchSelection | null) => {
    if (next) params.set(SEARCH_SEL_PARAM, formatSearchSel(next.entityType, next.id));
    else params.delete(SEARCH_SEL_PARAM);
  }, []);

  const { value, setValue } = useOptimisticUrlParam<SearchSelection | null>({
    urlValue: urlSel,
    equals: searchSelEquals,
    replace,
    write,
  });

  return { sel: value, setSel: setValue };
}
