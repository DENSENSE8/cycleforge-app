'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Path-agnostic `?search=` read/write for a workbench header search field.
 *
 * The one scoped-search waist for workbench pages that don't need the
 * dashboard's extra behavior (openOrderId reset, forced `/dashboard` target).
 * Reads/writes `?search=` on the *current* path via `router.replace`, so the
 * same field works on any page (e.g. `/test` Shipping) — hand the pair to
 * {@link DataTable}'s `search` prop. Tables read `?search=` off the URL directly
 * (see `UnshippedTable`), so no prop threading is needed.
 *
 * The dashboard keeps `useDashboardSearchController` for its richer semantics.
 */
export function useWorkbenchSearchParam() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const searchQuery = String(searchParams.get('search') || '').trim();

  const setSearch = useCallback(
    (next: string) => {
      const trimmed = next.trim();
      if (trimmed === String(searchParams.get('search') || '').trim()) return;
      const params = new URLSearchParams(searchParams.toString());
      if (trimmed) params.set('search', trimmed);
      else params.delete('search');
      const qs = params.toString();
      const base = pathname || '/';
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return { searchQuery, setSearch };
}
