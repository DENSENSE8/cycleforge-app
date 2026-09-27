'use client';

/**
 * Incoming's chrome, as DATA — the same job {@link useToShipChrome} does for To-ship.
 * Delivery state is not here: it is the status chips' (`IncomingStatusChips`).
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { DataTableFilterOption } from '@/components/tables/DataTable';
import { receivingSurfaceBasePath } from '@/lib/receiving/surface-path';

const SOURCE_OPTIONS = [
  { id: 'zoho', label: 'Zoho' },
  { id: 'ebay', label: 'eBay' },
] as const;

export function useIncomingTableChrome(): {
  filter: {
    options: readonly DataTableFilterOption[];
    onToggle: (id: string) => void;
    onClearAll: () => void;
  };
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const base = receivingSurfaceBasePath(pathname);

  const inbound = (searchParams.get('inbound') || '').trim().toLowerCase();

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      next.delete('page');
      const qs = next.toString();
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [router, searchParams, base],
  );

  const filterOptions = useMemo<DataTableFilterOption[]>(
    () =>
      SOURCE_OPTIONS.map((option) => ({
        id: `source:${option.id}`,
        group: 'Source',
        label: option.label,
        active: inbound === option.id,
      })),
    [inbound],
  );

  const onToggle = useCallback(
    (id: string) => {
      const src = id.slice('source:'.length);
      replaceParams((params) => {
        if (params.get('inbound') === src) params.delete('inbound');
        else params.set('inbound', src);
      });
    },
    [replaceParams],
  );

  const onClearAll = useCallback(() => {
    replaceParams((params) => {
      params.delete('inbound');
    });
  }, [replaceParams]);

  return {
    filter: {
      options: filterOptions,
      onToggle,
      onClearAll,
    },
  };
}
