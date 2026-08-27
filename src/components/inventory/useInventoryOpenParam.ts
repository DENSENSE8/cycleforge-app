'use client';

/**
 * `/inventory/units` `?open=<kind>:<ref>` paint-pending — the row-click handler
 * and the push-inspector registrar share one optimistic value so the inspector
 * mounts in the click commit, not after the App Router soft-replace catches up
 * (the mount-gated-open hard law — `source-of-truth.md` → Optimistic URL-param
 * paint).
 *
 * `open` is already OWNED by the `/inventory` prefix as `paramText`
 * (`query-mode-routes.ts` → `INVENTORY_ROUTE_PARAMS`), so `SurfaceParamHygiene`
 * keeps it across a reload / deep-link and the param-ownership guard passes with
 * no routing edit. The value vocabulary is the shared `kind:ref` codec in
 * `@/lib/inventory-events-channel`, never a second parser.
 *
 * This is the units-route Wave-1 replacement for the legacy shell's
 * `useInventoryUrlState` `open` channel — a separate hook because the units
 * workspace is its own React tree on its own route.
 */

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

  // Within-route param mutation: clone the current query, toggle `open`, and let
  // `SurfaceParamHygiene` re-parse declared keys on arrival (same idiom as
  // `useSearchSelParam`). Route stays `/inventory/units`, so this is not a
  // cross-surface mode switch — `q` / `state` / `condition` are preserved.
  const replace = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      // Emit in the route's declared key order so `SurfaceParamHygiene` sees the
      // URL already canonical and does NOT fire a second reordering replace
      // (URLSearchParams.set appends `open` at the end; hygiene rebuilds in
      // declaredKeys order). parseRouteParams keeps owned + carried keys, so the
      // active `q`/`state`/`condition` filters and the ambient `colsort`/`coldir`
      // column sort survive.
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
