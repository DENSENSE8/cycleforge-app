'use client';

import { useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Rewrite the current URL's params in place. History API, not
 * `router.replace` — Next syncs `useSearchParams` from it without a server
 * round-trip, and the list reads the URL, so the URL stays the one state.
 */
export function useReplaceSearchParams(): (mutate: (params: URLSearchParams) => void) => void {
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  return useCallback(
    (mutate) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      mutate(params);
      const next = params.toString();
      window.history.replaceState(null, '', next ? `${pathname}?${next}` : pathname);
    },
    [pathname, searchParams],
  );
}
