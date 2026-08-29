'use client';

/**
 * To-ship's Sheets chrome — the toolbar row above the grid and the tab/status
 * strip below it.
 *
 * This replaces `OutboundWorkspaceHeader` (Band 1: triage facets + Add),
 * `OutboundKpiStrip` (Band 2), and `OutboundTriageBand` (Band 3: find · Views ·
 * KPI toggle · inspector) with one hook feeding one `SheetView`.
 *
 * ## What moved where
 *
 * | Was | Now |
 * |---|---|
 * | Band 1 triage facets (All · Must ship · Urgent · OOS · Awaiting customer) | bottom-bar sheet tabs |
 * | Band 1 `+ Add` | **gone** — the global header owns Add |
 * | Band 2 KPI (Pending · Must ship · Units stuck · Ready to pack · Packed this week) | **gone** (operator ruling 2026-08-29) |
 * | Band 3 find (`flex-1`) | toolbar find, fixed 220px |
 * | Band 3 Views | toolbar view group |
 * | Band 3 KPI toggle | **gone** — nothing left to toggle |
 * | Band 3 inspector | toolbar view group |
 * | Urgent / Blocked filter popover | toolbar filter button, lit + counted |
 *
 * The facets keep writing `?facet=` exactly as they did, so every bookmark and
 * every e2e deep-link still resolves — moving a control does not move its state.
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
import {
  WorkbenchFilterDivider,
  WorkbenchFilterGroupLabel,
  WorkbenchFilterMenuRow,
} from '@/components/dashboard/workbench-filter-popover';
import {
  usePackedFindFieldChrome,
  useToShipFilterActions,
  useToShipFilterHotkeys,
} from '@/components/dashboard/OutboundFilterStrip';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { PackBenchRefineFacet } from '@/components/packing/PackBenchRefineFacet';
import { isPrePackOrderView, type DashboardOrderView } from '@/utils/dashboard-search-state';
import { useDashboardSearchController } from '@/hooks/useDashboardSearchController';
import { parseStaffParam } from '@/hooks/useStaffFilter';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import { fulfillmentLaneTotals } from '@/lib/unshipped-state';
import type { SheetBottomBarProps } from '@/components/sheet/SheetBottomBar';
import type { SheetTab } from '@/components/sheet/SheetBottomBar';

/** Facet order in the tab strip — unchanged from the Band-1 rail. */
const TRIAGE_FACETS = [
  'all',
  'must_ship',
  'urgent',
  'blocked',
  'awaiting_customer',
] as const satisfies readonly ToShipTriageFacet[];

export interface OutboundSheetChrome {
  /**
   * The find field as a NODE, not a value/onChange pair.
   *
   * This desk's field is not a plain input: on the Packed stage it carries the
   * date-range + staff chips (`usePackedFindFieldChrome`), and on the pre-pack
   * stages an in-field bench refine facet. Those rode on Band 3's
   * `TechRailSearchBar` and were lost for one commit when that band was
   * replaced — `to-ship-packed-sheet.spec.ts` caught it. `SheetToolbar`'s
   * `searchSlot` exists for exactly this.
   */
  searchSlot: React.ReactNode;
  filters: { activeCount: number; children: React.ReactNode; onClearAll: () => void };
  bottomBar: SheetBottomBarProps;
}

export function useOutboundSheetChrome(orderView?: DashboardOrderView): OutboundSheetChrome {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { searchQuery, setSearch } = useDashboardSearchController();
  const staffId = parseStaffParam(searchParams.get('staff')) ?? undefined;
  const { data: queueCounts } = useQuery(unshippedQueueCountsQuery({ staffId }));
  const activeFacet = getToShipTriageFacetFromSearch(searchParams);
  const { active, urgentOnly, selectAll, toggleBlocked, toggleUrgent } =
    useToShipFilterActions();
  // A · 3 · 4 · U kept alive off the retired Band 3 — moving a control must not
  // silently drop its keyboard path.
  useToShipFilterHotkeys(true);

  // Stage-specific in-field chrome. Both hooks run unconditionally (hooks
  // cannot be called in a branch); only what RENDERS is conditional.
  const packedFind = usePackedFindFieldChrome();
  const stageParam = String(searchParams.get('stage') || '').toLowerCase();
  const showPackedFind = stageParam === 'packed' || searchParams.has('packed');
  const showBenchFacet = orderView ? isPrePackOrderView(orderView) : false;

  const laneTotals = fulfillmentLaneTotals(queueCounts);
  const urgentCount = queueCounts?.urgent ?? 0;
  const mustShipCount = queueCounts?.mustShip ?? 0;

  const tabs = useMemo<SheetTab[]>(
    () =>
      TRIAGE_FACETS.map((id) => ({
        id,
        label: TO_SHIP_TRIAGE_FACET_LABEL[id],
        count:
          id === 'all'
            ? (queueCounts?.total ?? laneTotals.pending)
            : id === 'must_ship'
              ? mustShipCount || undefined
              : id === 'urgent'
                ? urgentCount || undefined
                : id === 'blocked'
                  ? laneTotals.blocked || undefined
                  : undefined,
      })),
    [queueCounts?.total, laneTotals.pending, laneTotals.blocked, mustShipCount, urgentCount],
  );

  const onTabChange = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams.toString());
      applyToShipTriageFacet(next, id as ToShipTriageFacet);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // Refinements that are NOT the tab. The tab is the scope; these narrow within
  // it, and only these light the funnel — counting the tab would leave the
  // control lit on every load, which is the "default that looks like state"
  // the toolbar face's docblock rules out.
  const blockedActive = active === 'BLOCKED';
  const activeCount = (blockedActive ? 1 : 0) + (urgentOnly ? 1 : 0);

  const filterRows = (
    <>
      <WorkbenchFilterGroupLabel>Filters</WorkbenchFilterGroupLabel>
      <WorkbenchFilterMenuRow
        label="All on tab"
        count={laneTotals.pending}
        active={activeCount === 0}
        shortcut="A"
        onClick={selectAll}
      />
      <WorkbenchFilterDivider />
      <WorkbenchFilterMenuRow
        label="Urgent"
        count={urgentCount}
        active={urgentOnly}
        shortcut="4"
        leading={<span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />}
        onClick={toggleUrgent}
      />
      <WorkbenchFilterMenuRow
        label="Blocked"
        count={laneTotals.blocked}
        active={blockedActive}
        shortcut="3"
        onClick={toggleBlocked}
      />
    </>
  );

  return {
    searchSlot: (
      <TechRailSearchBar
        variant="chrome"
        value={searchQuery}
        onChange={setSearch}
        placeholder="Filter orders…"
        className="min-w-0 flex-1"
        // Packed: the date-range + staff chips ride INSIDE the field, left of
        // paste. Pre-pack: the bench refine facet does.
        inlineContentKey={showPackedFind ? packedFind.inlineContentKey : undefined}
        trailingPrefix={showPackedFind ? packedFind.trailingPrefix : undefined}
        trailingSuffix={
          !showPackedFind && showBenchFacet ? <PackBenchRefineFacet /> : undefined
        }
      />
    ),
    filters: { activeCount, children: filterRows, onClearAll: selectAll },
    bottomBar: { tabs, activeTab: activeFacet, onTabChange },
  };
}
