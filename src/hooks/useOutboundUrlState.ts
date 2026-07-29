'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  OUTBOUND_MODE_PATHS,
  SHIPPING_PATH,
  outboundModeFromPath,
  parseOutboundMode,
  parseOutboundSort,
  type OutboundMode,
  type OutboundSort,
} from '@/components/outbound/outbound-sidebar-shared';
import { OUTBOUND_MODE_ROUTE_PARAMS } from '@/lib/routing/outbound-routes';
import { buildRouteUrl, parseRouteParams } from '@/lib/routing/route-params';
import { routeParamsFor } from '@/lib/routing/registry';

export function useOutboundUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Path-first: being on `/shipping/ready` IS ready mode. `?mode=` survives only
  // as a read-fallback for a legacy link that has not been redirected yet.
  const mode = useMemo(
    () => outboundModeFromPath(pathname) ?? parseOutboundMode(searchParams.get('mode')),
    [pathname, searchParams],
  );
  const q = useMemo(() => String(searchParams.get('q') || '').trim(), [searchParams]);
  const open = useMemo(() => {
    const raw = searchParams.get('open');
    if (!raw || !/^\d+$/.test(raw)) return null;
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  }, [searchParams]);
  const sort = useMemo(
    () => parseOutboundSort(searchParams.get('sort')),
    [searchParams],
  );
  // New-order entry (`?new=true`) — opens the ShippedIntakeForm as a focused
  // slide-over over the labels workspace (moved off the dashboard sidebar).
  const newOpen = useMemo(
    () => searchParams.get('new') === 'true',
    [searchParams],
  );

  // In-surface edits stay on the mode's OWN route; never bounce to bare
  // /shipping (which redirects) or to legacy /outbound.
  const basePath = OUTBOUND_MODE_PATHS[mode] ?? SHIPPING_PATH;

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      // Boundary-parse first, so an in-surface edit patches only what this route
      // owns — a stale key from a pasted link cannot ride along on the next edit.
      const spec = routeParamsFor(basePath);
      const raw = new URLSearchParams(searchParams.toString());
      const params = spec ? parseRouteParams(spec, raw) : raw;
      mutate(params);
      const qs = params.toString();
      router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
    },
    [basePath, router, searchParams],
  );

  const updateMode = useCallback(
    (next: OutboundMode) => {
      // CONSTRUCT the target, never copy the current query string. This is what
      // replaced OUTBOUND_MODE_SCOPED_PARAMS: there is no list of sixteen keys
      // to remember to delete, because nothing rides along unless named here.
      // The staff filter is the one deliberate carry — an operator preference,
      // not mode state.
      const staff = searchParams.get('staff') ?? searchParams.get('staffId');
      router.push(buildRouteUrl(OUTBOUND_MODE_ROUTE_PARAMS[next], { staff }));
    },
    [router, searchParams],
  );

  const setQ = useCallback(
    (value: string) => {
      replaceParams((params) => {
        const trimmed = value.trim();
        if (trimmed) params.set('q', trimmed);
        else params.delete('q');
      });
    },
    [replaceParams],
  );

  const setOpen = useCallback(
    (orderId: number | null) => {
      replaceParams((params) => {
        if (orderId != null && orderId > 0) params.set('open', String(orderId));
        else params.delete('open');
      });
    },
    [replaceParams],
  );

  const setSort = useCallback(
    (next: OutboundSort) => {
      replaceParams((params) => {
        if (next === 'newest') params.set('sort', 'newest');
        else params.delete('sort');
      });
    },
    [replaceParams],
  );

  const openNew = useCallback(() => {
    replaceParams((params) => params.set('new', 'true'));
  }, [replaceParams]);

  const closeNew = useCallback(() => {
    replaceParams((params) => params.delete('new'));
  }, [replaceParams]);

  return {
    mode,
    q,
    open,
    sort,
    newOpen,
    updateMode,
    setQ,
    setOpen,
    setSort,
    openNew,
    closeNew,
  };
}
