'use client';

/** Unbox Queue / Viewed / History chrome, as DATA — the same job {@link useIncomingTableChrome} does for Incoming and {@link… */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { DataTableFilterChrome, DataTableFilterOption } from '@/components/tables/DataTable';
import { receivingSurfaceBasePath } from '@/lib/receiving/surface-path';
import {
  UNBOX_KPI_FILTER_PARAM,
  UNBOX_KPI_FILTER_WIRE_IDS,
  unboxKpiFilterLabel,
  unboxKpiRowFilter,
} from '@/lib/receiving/unbox-metrics';
import { getUnboxWorkspaceTabFromSearch } from '@/utils/unbox-workspace-state';

export function useReceivingTableChrome(): { filter: DataTableFilterChrome } {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const base = receivingSurfaceBasePath(pathname);

  const tab = getUnboxWorkspaceTabFromSearch(searchParams);
  const ukpi = (searchParams.get(UNBOX_KPI_FILTER_PARAM) || '').trim().toLowerCase();

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
      UNBOX_KPI_FILTER_WIRE_IDS.filter((id) => unboxKpiRowFilter(id, tab) != null).map((id) => ({
        id,
        group: 'KPI',
        label: unboxKpiFilterLabel(id),
        active: ukpi === id,
      })),
    [tab, ukpi],
  );

  const onToggle = useCallback(
    (id: string) => {
      replaceParams((params) => {
        if (params.get(UNBOX_KPI_FILTER_PARAM) === id) params.delete(UNBOX_KPI_FILTER_PARAM);
        else params.set(UNBOX_KPI_FILTER_PARAM, id);
      });
    },
    [replaceParams],
  );

  const onClearAll = useCallback(() => {
    replaceParams((params) => {
      params.delete(UNBOX_KPI_FILTER_PARAM);
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
