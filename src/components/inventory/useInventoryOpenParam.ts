'use client';

/** `/inventory/units` `?open=<kind>:<ref>` paint-pending — the row-click handler and the push-inspector registrar share one optimistic… */

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOptimisticUrlParam } from '@/hooks/useOptimisticUrlParam';
import { INVENTORY_ROUTE_PARAMS } from '@/lib/routing/query-mode-routes';
import { parseRouteParams } from '@/lib/routing/route-params';
import {
  parseInventoryOpenKey,
  type OpenInventoryDetailsPayload,
} from '@/lib/inventory-events-channel';

const INVENTORY_UNITS_ROUTE = '/inventory/units';
const OPEN_PARAM = 'open';

export function useInventoryOpenParam(): {
  /** Parsed selection (optimistic), or `null` when nothing is open. */
  selection: OpenInventoryDetailsPayload | null;
  /** Set/clear the `kind:ref` open key. Pass `null` to close. */
  setOpen: (next: string | null) => void;
} {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlOpen = searchParams.get(OPEN_PARAM);

  // Within-route param mutation:
  const replace = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      // Emit in the route's declared key order so `SurfaceParamHygiene` sees the URL already canonical and does NOT fire a second reordering…
      const qs = parseRouteParams(INVENTORY_ROUTE_PARAMS, params).toString();
      router.replace(qs ? `${INVENTORY_UNITS_ROUTE}?${qs}` : INVENTORY_UNITS_ROUTE, {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  const write = useCallback((params: URLSearchParams, next: string | null) => {
    if (next) params.set(OPEN_PARAM, next);
    else params.delete(OPEN_PARAM);
  }, []);

  const { value, setValue } = useOptimisticUrlParam<string | null>({
    urlValue: urlOpen,
    replace,
    write,
  });

  const selection = useMemo(() => parseInventoryOpenKey(value), [value]);

  return { selection, setOpen: setValue };
}
