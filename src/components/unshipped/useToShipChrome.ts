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
 * ## One filter control, both axes (operator ruling 2026-08-30)
 *
 * The bottom tab strip is GONE from this desk — the operator overruled the
 * "a dropdown never replaces the strip" law in writing ("don't care what the
 * standing rule is. Break it."): selection tabs ARE filters, so both axes now
 * live in the ONE filter popover:
 *
 * - **Triage facets** (`?late` / `?attention` / `?ustatus` / `?rowFlag` /
 *   `?cage`, written through `applyToShipTriageFacet`) — mutually exclusive
 *   among themselves, so picking one clears the others and picking the active
 *   one clears back to the unfiltered list. There is still no **All** option:
 *   "all" is the absence of a filter (§ 2.2). `caged` swaps the desk's data
 *   source rather than narrowing it; the URL contract is unchanged, only the
 *   control moved.
 * - **Lifecycle stage** (`?stage=pending|tested|packed`) — *where is this
 *   order in the pipeline* rather than *why does it need attention*. The two
 *   axes still compose: a stage pick never clears the facet.
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

/**
 * Facet order in the filter menu. `all` is deliberately absent — see above.
 *
 * `caged` sits LAST because it is the only facet that swaps the desk's data
 * source rather than narrowing it: everything left of it is a slice of the live
 * queue, and caged is the set that is not in the queue at all.
 */
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

export interface ToShipChrome {
  search: { value: string; onChange: (value: string) => void; placeholder: string };
  filter: {
    options: readonly DataTableFilterOption[];
    onToggle: (id: string) => void;
    onClearAll: () => void;
  };
  /**
   * Rows behind the CURRENT narrowing — `undefined` when no server count
   * describes it. See {@link useToShipChrome} for why that is the honest answer
   * rather than falling back to the queue total.
   */
  totalCount: number | undefined;
}

export function useToShipChrome(options?: { blockedQueue?: boolean }): ToShipChrome {
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

  /*
   * The denominator, and when there isn't one.
   *
   * The bar was handed `queueCounts.total` unconditionally, so a facet-narrowed
   * view read "12 of 922": a count of rows the operator had just filtered away.
   * A footer underneath then printed a SECOND, stage-aware sentence against a
   * different denominator, and neither described the set on screen.
   *
   * A denominator is published only when a server count actually answers for
   * what is rendered — one facet alone, or one stage alone. Facets and stages
   * COMPOSE (the whole reason they are banded apart in the menu), and no
   * endpoint counts the intersection, so that case publishes nothing and the
   * bar prints "N rows". Same law as the today strip and the tab counts: no
   * number beats a number that is answering a different question.
   */
  const facetTotal =
    activeFacet === 'must_ship'
      ? queueCounts?.mustShip
      : activeFacet === 'urgent'
        ? queueCounts?.urgent
        : activeFacet === 'blocked'
          ? laneTotals.blocked
          : activeFacet === 'caged'
            ? cagedCount
            : undefined;
  const stageTotal =
    stage === 'pending'
      ? laneTotals.pending
      : stage === 'tested'
        ? laneTotals.tested
        : stage === 'packed'
          ? (queueCounts?.byStage as { packed?: number } | undefined)?.packed
          : undefined;
  const facetActive = activeFacet !== 'all';
  const stageActive = stageTotal !== undefined;
  const blockedQueue = options?.blockedQueue === true;
  const narrowedTotal =
    blockedQueue
      ? laneTotals.blocked
      : facetActive && stageActive
        ? undefined // two narrowings, no count for their intersection
        : facetActive
          ? facetTotal
          : stageActive
            ? stageTotal
            : queueCounts?.total;

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // ONE options list, two axes: the triage facets lead (they are the desk's
  // "why does this need attention" vocabulary — the reason the control
  // exists), the lifecycle stages follow. Facet counts ride each option so
  // the overview the tab strip used to show is one click away, not rebuilt.
  //
  // The two axes are NAMED (`group`) because they do not behave alike: picking
  // a facet replaces the current one (they are exclusive, and picking the
  // active one clears to `all`), while a stage toggles on its own and composes
  // with whatever facet is set. Eight identical rows made an operator learn
  // that by trying it.
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
    ],
    [
      activeFacet,
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

  // Facet picks stay mutually exclusive (the URL writer clears siblings);
  // picking the active facet clears back to unfiltered — what "All" used to
  // do, without spending a permanent option on it. Stage picks toggle
  // independently and never clear the facet: the two axes compose.
  const onToggleFilter = useCallback(
    (id: string) => {
      replaceParams((params) => {
        if (isFacetId(id)) {
          applyToShipTriageFacet(params, id === activeFacet ? 'all' : id);
          return;
        }
        if (params.get('stage') === id) params.delete('stage');
        else params.set('stage', id);
      });
    },
    [replaceParams, isFacetId, activeFacet],
  );

  const onClearAllFilters = useCallback(() => {
    replaceParams((params) => {
      applyToShipTriageFacet(params, 'all');
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
    totalCount: narrowedTotal,
  };
}
