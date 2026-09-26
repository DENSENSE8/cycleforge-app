'use client';

/**
 * To-ship's chrome, as DATA.
 * ## One filter control, both axes (operator ruling 2026-08-30)
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  TO_SHIP_TRIAGE_FACET_LABEL,
  applyToShipTriageFacet,
  getToShipTriageFacetFromSearch,
  type ToShipTriageFacet,
} from '@/utils/dashboard-search-state';
import { useDashboardSearchController } from '@/hooks/useDashboardSearchController';
import { parseStaffParam } from '@/hooks/useStaffFilter';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import { cagedOrdersCountQuery } from '@/lib/queries/caged-orders-queries';
import { fulfillmentLaneTotals } from '@/lib/unshipped-state';
import type { DataTableFilterOption } from '@/components/tables/DataTable';

/** Facet order in the filter menu. */
const TRIAGE_FACETS = [
  'must_ship',
  'urgent',
  'blocked',
  'awaiting_customer',
  'caged',
] as const satisfies readonly ToShipTriageFacet[];

const STAGE_OPTIONS = [
  { id: 'pending', label: 'Pending' },
  { id: 'tested', label: 'Tested' },
  { id: 'packed', label: 'Packed' },
] as const;
const AGING_OPTIONS = [
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Due today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'unscheduled', label: 'No ship-by' },
] as const;

export interface ToShipChrome {
  search: { value: string; onChange: (value: string) => void; placeholder: string };
  filter: {
    options: readonly DataTableFilterOption[];
    onToggle: (id: string) => void;
    onClearAll: () => void;
  };
}

export function useToShipChrome(_opts?: { blockedQueue?: boolean }): ToShipChrome {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { searchQuery, setSearch } = useDashboardSearchController();
  const staffId = parseStaffParam(searchParams.get('staff')) ?? undefined;
  const { data: queueCounts } = useQuery(unshippedQueueCountsQuery({ staffId }));
  // Its own cheap key — the facet must be able to LABEL itself on every desk
  // paint without pulling the caged rows to count them.
  const { data: cagedCount } = useQuery(cagedOrdersCountQuery());

  const laneTotals = fulfillmentLaneTotals(queueCounts);
  const activeFacet = getToShipTriageFacetFromSearch(searchParams);
  const stage = String(searchParams.get('stage') || '').toLowerCase();
  const aging = String(searchParams.get('aging') || '').toLowerCase();


  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // ONE options list, two axes:
  const filterOptions = useMemo<DataTableFilterOption[]>(
    () => [
      ...TRIAGE_FACETS.map((id) => ({
        id,
        group: 'Needs attention',
        label: TO_SHIP_TRIAGE_FACET_LABEL[id],
        count:
          id === 'must_ship'
            ? queueCounts?.mustShip || undefined
            : id === 'urgent'
              ? queueCounts?.urgent || undefined
              : id === 'blocked'
                ? laneTotals.blocked || undefined
                : id === 'caged'
                  ? cagedCount || undefined
                  : undefined,
        active: id === activeFacet,
      })),
      ...STAGE_OPTIONS.map((option) => ({
        id: option.id,
        group: 'Stage',
        label: option.label,
        count:
          option.id === 'pending'
            ? laneTotals.pending || undefined
            : option.id === 'tested'
              ? laneTotals.tested || undefined
              : (queueCounts?.byStage as { packed?: number } | undefined)?.packed || undefined,
        active: stage === option.id,
      })),
      ...AGING_OPTIONS.map((option) => ({
        id: option.id,
        group: 'Ship-by age',
        label: option.label,
        active: aging === option.id,
      })),
    ],
    [
      activeFacet,
      aging,
      queueCounts?.mustShip,
      queueCounts?.urgent,
      queueCounts?.byStage,
      laneTotals.blocked,
      laneTotals.pending,
      laneTotals.tested,
      cagedCount,
      stage,
    ],
  );

  const isFacetId = useCallback(
    (id: string): id is ToShipTriageFacet =>
      (TRIAGE_FACETS as readonly string[]).includes(id),
    [],
  );

  const isAgingId = useCallback(
    (id: string): boolean => AGING_OPTIONS.some((option) => option.id === id),
    [],
  );

  // Facets replace one another; stage and aging are independent refinements.
  const onToggleFilter = useCallback(
    (id: string) => {
      replaceParams((params) => {
        if (isFacetId(id)) {
          applyToShipTriageFacet(params, id === activeFacet ? 'all' : id);
          return;
        }
        if (isAgingId(id)) {
          if (params.get('aging') === id) params.delete('aging');
          else params.set('aging', id);
          return;
        }
        if (params.get('stage') === id) params.delete('stage');
        else params.set('stage', id);
      });
    },
    [replaceParams, isFacetId, isAgingId, activeFacet],
  );

  const onClearAllFilters = useCallback(() => {
    replaceParams((params) => {
      applyToShipTriageFacet(params, 'all');
      params.delete('stage');
      params.delete('aging');
    });
  }, [replaceParams]);


  return {
    search: {
      value: searchQuery,
      onChange: setSearch,
      placeholder: 'Filter orders…',
    },
    filter: {
      options: filterOptions,
      onToggle: onToggleFilter,
      onClearAll: onClearAllFilters,
    },
  };
}
