'use client';

/**
 * To-ship's chrome, as DATA.
 *
 * {@link DataTable} takes a search value, a list of filter OPTIONS and a list of
 * tabs — never JSX — so everything this desk's controls used to draw is
 * resolved here into plain objects and the display draws itself. That is the
 * whole difference between one table display and thirty
 * (`docs/todo/one-table-sot-teardown-HANDOFF.md` § 5).
 *
 * ## What the two axes are
 *
 * **Tabs are the triage facet** (`?late` / `?attention` / `?ustatus` /
 * `?rowFlag`, written through `applyToShipTriageFacet`). They are mutually
 * exclusive, so clicking the lit tab clears back to the unfiltered list —
 * there is no **All** tab, because "all" is the absence of a filter and a tab
 * for it is a control that means *stop* (§ 2.2).
 *
 * **The filter is the lifecycle stage** (`?stage=pending|tested|packed`). It is
 * a genuinely different question from the triage facet — *where is this order
 * in the pipeline* rather than *why does it need attention* — and the two
 * compose. The old toolbar spent two controls (a funnel inside the find field
 * and another beside it) restating the tabs; one control, one job (§ 2.1).
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
import { fulfillmentLaneTotals } from '@/lib/unshipped-state';
import type { DataTableFilterOption, DataTableTab } from '@/components/tables/DataTable';

/** Facet order in the tab strip. `all` is deliberately absent — see above. */
const TRIAGE_TABS = [
  'must_ship',
  'urgent',
  'blocked',
  'awaiting_customer',
] as const satisfies readonly ToShipTriageFacet[];

const STAGE_OPTIONS = [
  { id: 'pending', label: 'Pending' },
  { id: 'tested', label: 'Tested' },
  { id: 'packed', label: 'Packed' },
] as const;

export interface ToShipChrome {
  search: { value: string; onChange: (value: string) => void; placeholder: string };
  filter: {
    options: readonly DataTableFilterOption[];
    onToggle: (id: string) => void;
    onClearAll: () => void;
  };
  tabs: readonly DataTableTab[];
  activeTab: string | undefined;
  onTabChange: (id: string) => void;
  /** Rows the queue holds before this view's narrowing. */
  totalCount: number | undefined;
}

export function useToShipChrome(): ToShipChrome {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { searchQuery, setSearch } = useDashboardSearchController();
  const staffId = parseStaffParam(searchParams.get('staff')) ?? undefined;
  const { data: queueCounts } = useQuery(unshippedQueueCountsQuery({ staffId }));

  const laneTotals = fulfillmentLaneTotals(queueCounts);
  const activeFacet = getToShipTriageFacetFromSearch(searchParams);
  const stage = String(searchParams.get('stage') || '').toLowerCase();

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const tabs = useMemo<DataTableTab[]>(
    () =>
      TRIAGE_TABS.map((id) => ({
        id,
        label: TO_SHIP_TRIAGE_FACET_LABEL[id],
        count:
          id === 'must_ship'
            ? queueCounts?.mustShip || undefined
            : id === 'urgent'
              ? queueCounts?.urgent || undefined
              : id === 'blocked'
                ? laneTotals.blocked || undefined
                : undefined,
      })),
    [queueCounts?.mustShip, queueCounts?.urgent, laneTotals.blocked],
  );

  // Clicking the lit tab clears back to the unfiltered list. The facets are
  // mutually exclusive in the URL, so this IS what "All" used to do — without
  // spending a permanent control on it.
  const onTabChange = useCallback(
    (id: string) => {
      const next: ToShipTriageFacet = id === activeFacet ? 'all' : (id as ToShipTriageFacet);
      replaceParams((params) => {
        applyToShipTriageFacet(params, next);
      });
    },
    [activeFacet, replaceParams],
  );

  const filterOptions = useMemo<DataTableFilterOption[]>(
    () =>
      STAGE_OPTIONS.map((option) => ({
        id: option.id,
        label: option.label,
        count:
          option.id === 'pending'
            ? laneTotals.pending || undefined
            : option.id === 'tested'
              ? laneTotals.tested || undefined
              : (queueCounts?.byStage as { packed?: number } | undefined)?.packed || undefined,
        active: stage === option.id,
      })),
    [laneTotals.pending, laneTotals.tested, queueCounts?.byStage, stage],
  );

  const onToggleFilter = useCallback(
    (id: string) => {
      replaceParams((params) => {
        if (params.get('stage') === id) params.delete('stage');
        else params.set('stage', id);
      });
    },
    [replaceParams],
  );

  const onClearAllFilters = useCallback(() => {
    replaceParams((params) => {
      params.delete('stage');
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
    tabs,
    // The unfiltered list lights no tab.
    activeTab: activeFacet === 'all' ? undefined : activeFacet,
    onTabChange,
    totalCount: queueCounts?.total,
  };
}
