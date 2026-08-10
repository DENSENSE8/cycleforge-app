'use client';

/**
 * FBA workspace chrome — lifecycle stage tabs left (Ready · Plan · Combine ·
 * Shipped), search + week pill + select controls right. Composes
 * `WorkbenchChromeHeader` like `ShippingWorkspaceHeader`; the stage facets
 * moved here from the (dead) sidebar pill row — the sidebar keeps scan I/O +
 * rails only.
 *
 * Selection stays owned by `FbaBoardTable`: this header listens to the
 * `FBA_BOARD_SELECTION_COUNT` window event for the live count and dispatches
 * `FBA_BOARD_TOGGLE_ALL`, exactly like the toolbar it replaces.
 *
 * House Band-1 law (Unbox golden · To-ship desk exemplar): fixed stage tabs for
 * every staffer — never Chrome-style unpin of a system stage · Pin-list cube
 * omitted (honest absence — no closed foreign-collection catalog) · no page Views
 * yet (honest absence; if added they mount on Band 3, never Band-1 leading) ·
 * page-pin in GlobalHeader. Three pin scopes never share a trigger/store. SoT:
 * source-of-truth.md → Workbench Band-1 strip · Left-edge → SCOPE decides its home.
 */

import { useEffect, useMemo, useState, type ReactNode, type Ref } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  WorkbenchChromeHeader,
  WorkbenchTriageBand,
} from '@/components/dashboard/workbench-shell';
import { WorkbenchInspectorToggle } from '@/components/dashboard/workbench-inspector-toggle';
import { useRightRailOccupantOpen } from '@/components/right-rail/useRightRailOccupant';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { DateRangePickerPill } from '@/components/ui/DateRangeHeader';
import { Button } from '@/design-system/primitives';
import { qk } from '@/queries/keys';
import { FBA_BOARD_SELECTION_COUNT, FBA_BOARD_TOGGLE_ALL } from '@/lib/fba/events';
import type { FbaMode } from '@/lib/fba/fba-modes';
import { formatWeekRangeCompact } from '@/utils/date';

const TABS: {
  id: FbaMode;
  label: string;
  color: 'blue' | 'orange' | 'purple' | 'emerald';
}[] = [
  { id: 'ready', label: 'Ready', color: 'blue' },
  { id: 'plan', label: 'Plan', color: 'orange' },
  { id: 'combine', label: 'Combine', color: 'purple' },
  { id: 'shipped', label: 'Shipped', color: 'emerald' },
];

/** Org-wide stage counts — same query the `/test` Shipping FBA tiles read. */
function useFbaStageTabCounts(): { planned?: number; packed?: number } {
  const { data } = useQuery({
    queryKey: qk.fba.stageCounts,
    queryFn: async () => {
      const res = await fetch('/api/fba/stage-counts', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load FBA stage counts');
      const counts = ((await res.json())?.counts ?? {}) as Record<string, number>;
      return counts;
    },
    staleTime: 60_000,
  });
  if (!data) return {};
  return { planned: Number(data.PLANNED) || 0, packed: Number(data.PACKED) || 0 };
}

function useBoardSelectionCount(): { selected: number; total: number } {
  const [state, setState] = useState({ selected: 0, total: 0 });
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ selected: number; total: number }>).detail;
      if (!detail) return;
      setState({ selected: detail.selected, total: detail.total });
    };
    window.addEventListener(FBA_BOARD_SELECTION_COUNT, handler);
    return () => window.removeEventListener(FBA_BOARD_SELECTION_COUNT, handler);
  }, []);
  return state;
}

interface FbaWorkspaceHeaderProps {
  tab: FbaMode;
  onSelectTab: (tab: FbaMode) => void;
  /** Board filter (plan/combine), Ready search, or shipped search — cleared on tab change by the host. */
  search: string;
  onSearchChange: (value: string) => void;
  /** Week pill (plan/combine only). */
  weekRange?: { startStr: string; endStr: string };
  weekOffset?: number;
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  /** Visible row count under the current filters (week pill badge). */
  visibleCount?: number;
  className?: string;
}

/** Band 1 — lifecycle stage tabs only. Find / week / select live on {@link FbaTriageBand}. */
export function FbaWorkspaceHeader({
  tab,
  onSelectTab,
  className,
}: Pick<FbaWorkspaceHeaderProps, 'tab' | 'onSelectTab' | 'className'>) {
  const stageCounts = useFbaStageTabCounts();

  const tabs = useMemo(
    () =>
      TABS.map((t) => ({
        id: t.id,
        label: t.label,
        color: t.color,
        count:
          t.id === 'plan'
            ? stageCounts.planned
            : t.id === 'combine'
              ? stageCounts.packed
              : undefined,
        dividerBefore: t.id === 'shipped',
      })),
    [stageCounts.planned, stageCounts.packed],
  );

  return (
    <WorkbenchChromeHeader
      density="band"
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => onSelectTab(id as FbaMode)}
      solidTone="accent"
      className={className}
    />
  );
}

/** Band 3 — find flush left; week pill + select-all right (board modes). */
export function FbaTriageBand({
  tab,
  search,
  onSearchChange,
  weekRange,
  weekOffset = 0,
  onPrevWeek,
  onNextWeek,
  visibleCount,
  controlsSlotRef,
  className,
}: Omit<FbaWorkspaceHeaderProps, 'onSelectTab'> & {
  controlsSlotRef?: Ref<HTMLDivElement>;
}) {
  const selection = useBoardSelectionCount();
  const fbaInspectorOpen = useRightRailOccupantOpen('detail:fba-plan');
  const isBoard = tab === 'plan' || tab === 'combine';
  const isReady = tab === 'ready';
  const allVisibleSelected = selection.total > 0 && selection.selected === selection.total;

  const right: ReactNode = isBoard ? (
    <>
      {weekRange && onPrevWeek && onNextWeek ? (
        <DateRangePickerPill
          label={formatWeekRangeCompact(weekRange.startStr, weekRange.endStr)}
          count={visibleCount}
          weekNav={{ weekOffset, onPrev: onPrevWeek, onNext: onNextWeek }}
        />
      ) : null}
      <Button
        type="button"
        variant="secondary"
        className="h-8 px-2.5 text-role-micro uppercase tracking-widest"
        onClick={() =>
          window.dispatchEvent(
            new CustomEvent(FBA_BOARD_TOGGLE_ALL, {
              detail: allVisibleSelected ? 'none' : 'all',
            }),
          )
        }
      >
        {allVisibleSelected ? 'Clear' : 'Select all'}
      </Button>
      {selection.selected > 0 ? (
        <span className="text-role-eyebrow uppercase tracking-widest tabular-nums text-text-soft">
          {selection.selected} selected
        </span>
      ) : null}
    </>
  ) : null;

  const searchPlaceholder = isReady
    ? 'Search tested units…'
    : isBoard
      ? 'Filter title, Amazon SKU, ASIN, SKU, plan…'
      : 'Amazon SKU, ASIN, SKU, product…';

  return (
    <WorkbenchTriageBand
      className={className}
      controlsSlotRef={controlsSlotRef}
      search={
        <TechRailSearchBar
          variant="chrome"
          value={search}
          onChange={onSearchChange}
          placeholder={searchPlaceholder}
          className="min-w-0 flex-1"
        />
      }
      right={right}
      trailing={
        <WorkbenchInspectorToggle open={fbaInspectorOpen} testId="fba-inspector-toggle" />
      }
    />
  );
}
