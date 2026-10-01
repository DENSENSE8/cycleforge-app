'use client';

import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  OUTBOUND_MODE_PATHS,
  SHIPPING_PATH,
  outboundModeFromPath,
  parseOutboundMode,
  parseOutboundSort,
  type OutboundMode,
  type OutboundSort,
} from '@/lib/outbound/route-contract';
import { useOptimisticUrlParam } from '@/hooks/useOptimisticUrlParam';
import { OUTBOUND_MODE_ROUTE_PARAMS } from '@/lib/routing/outbound-routes';
import { buildRouteUrl, parseRouteParams } from '@/lib/routing/route-params';
import { routeParamsFor } from '@/lib/routing/registry';

function parseOutboundOpen(raw: string | null): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function useOutboundUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Path-first: being on `/shipping/fba` IS fba mode. `?mode=` survives only
  // as a read-fallback for a legacy link that has not been redirected yet.
  // Ready is `?fbaMode=ready` on the FBA path (parseOutboundMode maps ready→fba).
  const mode = useMemo(
    () => outboundModeFromPath(pathname) ?? parseOutboundMode(searchParams.get('mode')),
    [pathname, searchParams],
  );
  // Free-text table search is local. URL replacement per character causes a
  // soft navigation/remount and can clear the controlled input mid-search.
  const [q, setLocalQ] = useState('');
  const urlOpen = useMemo(
    () => parseOutboundOpen(searchParams.get('open')),
    [searchParams],
  );
  const sort = useMemo(
    () => parseOutboundSort(searchParams.get('sort')),
    [searchParams],
  );
  const urlNewOpen = useMemo(
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

  const writeOpen = useCallback((params: URLSearchParams, next: number | null) => {
    if (next != null && next > 0) params.set('open', String(next));
    else params.delete('open');
  }, []);

  const { value: open, setValue: setOpen } = useOptimisticUrlParam<number | null>({
    urlValue: urlOpen,
    replace: replaceParams,
    write: writeOpen,
  });

  const writeNewOpen = useCallback((params: URLSearchParams, next: boolean) => {
    if (next) params.set('new', 'true');
    else params.delete('new');
  }, []);

  const { value: newOpen, setValue: setNewOpen } = useOptimisticUrlParam<boolean>({
    urlValue: urlNewOpen,
    replace: replaceParams,
    write: writeNewOpen,
  });

  const updateMode = useCallback(
    (next: OutboundMode) => {
      // CONSTRUCT the target, never copy the current query string.
      const staff = searchParams.get('staff') ?? searchParams.get('staffId');
      router.push(buildRouteUrl(OUTBOUND_MODE_ROUTE_PARAMS[next], { staff }));
    },
    [router, searchParams],
  );

  const setQ = useCallback(
    (value: string) => setLocalQ(value),
    [],
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
    setNewOpen(true);
  }, [setNewOpen]);

  const closeNew = useCallback(() => {
    setNewOpen(false);
  }, [setNewOpen]);

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
