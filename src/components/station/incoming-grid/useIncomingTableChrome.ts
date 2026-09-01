'use client';

/**
 * Incoming's chrome, as DATA — the same job {@link useToShipChrome} does for
 * To-ship.
 *
 * {@link DataTable} takes a list of filter OPTIONS, never JSX. Delivery state
 * (`?state=`) and purchasing source (`?inbound=`) used to live in a hunt-tile
 * bar and a Band-3 FilterMenu cluster; both were forks of the one funnel that
 * sits to the right of this desk's search field. The table already prints
 * those facts on every row (`incoming.status`, `incoming.platform`).
 *
 * `all` is the absence of a filter on each axis: picking the active option
 * clears it. The two axes compose.
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { DataTableFilterOption } from '@/components/tables/DataTable';
import {
  INCOMING_DELIVERY_STATE_FACE,
  INCOMING_HUNT_TILE_ORDER,
} from '@/lib/receiving/incoming-delivery-state-face';
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

  const state = (searchParams.get('state') || '').trim().toUpperCase();
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
    () => [
      ...INCOMING_HUNT_TILE_ORDER.map((id) => ({
        id,
        group: 'Delivery',
        label: INCOMING_DELIVERY_STATE_FACE[id].tileLabel,
        active: state === id,
      })),
      ...SOURCE_OPTIONS.map((option) => ({
        id: `source:${option.id}`,
        group: 'Source',
        label: option.label,
        active: inbound === option.id,
      })),
    ],
    [state, inbound],
  );

  const onToggle = useCallback(
    (id: string) => {
      replaceParams((params) => {
        if (id.startsWith('source:')) {
          const src = id.slice('source:'.length);
          if (params.get('inbound') === src) params.delete('inbound');
          else params.set('inbound', src);
          return;
        }
        if (params.get('state') === id) params.delete('state');
        else params.set('state', id);
      });
    },
    [replaceParams],
  );

  const onClearAll = useCallback(() => {
    replaceParams((params) => {
      params.delete('state');
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
