'use client';

/**
 * History workbench chrome — five-row Sheets flush stack (Unbox golden):
 *
 *   Band 1 — carton-source tabs (All / Unfound) + honest-absence trailing
 *            ({@link HistoryWorkspaceHeader}).
 *   Band 2 — honest absence (standalone /receiving/history has no metrics strip).
 *   Band 3 — {@link HistoryTriageBand}: search LEFT · refine (sort / field
 *            popover) + week pill RIGHT — composes the SoT {@link WorkbenchTriageBand}.
 *
 * Search / field / sort / week all live on Band 3 now — never Band 1. Mirrors
 * `OutboundWorkspaceHeader` / `OutboundTriageBand`. Row select lives in the
 * table left gutter; column display (▦) portals into Band-3 `controlsSlotRef`.
 */

import { useCallback, useMemo, useState, type Ref } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  WorkbenchChromeHeader,
  WorkbenchTriageBand,
} from '@/components/dashboard/workbench-shell';
import {
  WorkbenchFilterDivider,
  WorkbenchFilterGroupLabel,
  WorkbenchFilterMenuRow,
  WorkbenchFilterPopover,
} from '@/components/dashboard/workbench-filter-popover';
import { WorkbenchInspectorToggle } from '@/components/dashboard/workbench-inspector-toggle';
import { useRightRailOccupantOpen } from '@/components/right-rail/useRightRailOccupant';
import { RECEIVING_RAIL_OCCUPANT_ID } from '@/lib/right-rail/receiving-selection-occupancy';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { DateRangePickerPill } from '@/components/ui/DateRangeHeader';
import {
  HISTORY_SORT_OPTIONS,
  HISTORY_DEFAULT_SORT,
  normalizeHistorySort,
} from '@/lib/receiving/receiving-modes';
import {
  RECEIVING_HISTORY_SEARCH_FIELDS,
  RECEIVING_HISTORY_URL_PARAMS,
  getReceivingHistoryPlaceholder,
  normalizeReceivingHistorySearchField,
  normalizeReceivingHistorySearchScope,
  setReceivingHistoryUrlParams,
  type ReceivingHistorySearchScope,
} from '@/lib/receiving-history-search';
import { formatWeekRangeCompact } from '@/utils/date';

/** Shared URL replace — both bands write history search params. */
function useHistoryParamReplace() {
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(
    (next: URLSearchParams) => {
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );
}

/** Band 1 — carton-source tabs. Search / refine live on {@link HistoryTriageBand}. */
export function HistoryWorkspaceHeader({ className }: { className?: string }) {
  const searchParams = useSearchParams();
  const replaceParams = useHistoryParamReplace();

  const searchScope = useMemo(
    () => normalizeReceivingHistorySearchScope(searchParams.get(RECEIVING_HISTORY_URL_PARAMS.scope)),
    [searchParams],
  );

  const setScope = useCallback(
    (id: string) => {
      replaceParams(
        setReceivingHistoryUrlParams(searchParams, {
          scope: normalizeReceivingHistorySearchScope(id),
        }),
      );
    },
    [replaceParams, searchParams],
  );

  const tabs: Array<{
    id: ReceivingHistorySearchScope;
    label: string;
    color: 'blue' | 'orange';
    dividerBefore?: boolean;
  }> = [
    { id: 'all', label: 'All', color: 'blue' },
    { id: 'unmatched', label: 'Unfound', color: 'orange', dividerBefore: true },
  ];

  return (
    <WorkbenchChromeHeader
      density="band"
      className={className}
      tabs={tabs}
      activeTab={searchScope}
      onTabChange={setScope}
      solidTone="accent"
    />
  );
}

interface HistoryTriageBandProps {
  weekRange: { startStr: string; endStr: string };
  weekOffset: number;
  weekCount: number;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  className?: string;
  /** Band-3 controls slot — hosts the portaled column-display (▦) trigger. */
  controlsSlotRef?: Ref<HTMLDivElement>;
}

/**
 * Band 3 — find-only command row (Unbox History golden). Dominant find carries
 * the whole row with refine (sort · search field · week) in-field; the right
 * zone is view toggles only (▦ portal · inspector park).
 */
export function HistoryTriageBand({
  weekRange,
  weekOffset,
  weekCount,
  onPrevWeek,
  onNextWeek,
  className,
  controlsSlotRef,
}: HistoryTriageBandProps) {
  const searchParams = useSearchParams();
  const replaceParams = useHistoryParamReplace();

  const searchField = useMemo(
    () => normalizeReceivingHistorySearchField(searchParams.get(RECEIVING_HISTORY_URL_PARAMS.field)),
    [searchParams],
  );
  const historySort = useMemo(
    () => normalizeHistorySort(searchParams.get('sort')),
    [searchParams],
  );

  const urlQRaw = searchParams.get(RECEIVING_HISTORY_URL_PARAMS.q) ?? '';

  const setHistorySearch = useCallback(
    (q: string) => {
      replaceParams(setReceivingHistoryUrlParams(searchParams, { q }));
    },
    [replaceParams, searchParams],
  );

  const setField = useCallback(
    (id: string) => {
      replaceParams(
        setReceivingHistoryUrlParams(searchParams, {
          field: normalizeReceivingHistorySearchField(id),
        }),
      );
    },
    [replaceParams, searchParams],
  );

  const setSort = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams.toString());
      const normalized = normalizeHistorySort(id);
      if (normalized === HISTORY_DEFAULT_SORT) next.delete('sort');
      else next.set('sort', normalized);
      replaceParams(next);
    },
    [replaceParams, searchParams],
  );

  const clearFilters = useCallback(() => {
    const next = setReceivingHistoryUrlParams(searchParams, { field: 'all' });
    next.delete('sort');
    replaceParams(next);
  }, [replaceParams, searchParams]);

  const [filterOpen, setFilterOpen] = useState(false);
  const filterHot = searchField !== 'all' || historySort !== HISTORY_DEFAULT_SORT;
  const historyInspectorOpen = useRightRailOccupantOpen(
    RECEIVING_RAIL_OCCUPANT_ID.historyInspect,
  );

  const placeholder = getReceivingHistoryPlaceholder(searchField).replace(/^Search/, 'Filter');

  const inFieldRefine = (
    <>
      <WorkbenchFilterPopover
        open={filterOpen}
        onOpenChange={setFilterOpen}
        hot={filterHot}
        label="Refine"
        density="field"
      >
        {HISTORY_SORT_OPTIONS.length > 1 ? (
          <>
            <WorkbenchFilterGroupLabel>Sort by</WorkbenchFilterGroupLabel>
            {HISTORY_SORT_OPTIONS.map((option) => (
              <WorkbenchFilterMenuRow
                key={option.id}
                label={option.label}
                active={historySort === option.id}
                onClick={() => {
                  setSort(option.id);
                  setFilterOpen(false);
                }}
              />
            ))}
            <WorkbenchFilterDivider />
          </>
        ) : null}
        <WorkbenchFilterGroupLabel>Search field</WorkbenchFilterGroupLabel>
        {RECEIVING_HISTORY_SEARCH_FIELDS.map((field) => (
          <WorkbenchFilterMenuRow
            key={field.id}
            label={field.label}
            active={searchField === field.id}
            onClick={() => {
              setField(field.id);
              setFilterOpen(false);
            }}
          />
        ))}
        <WorkbenchFilterDivider />
        <WorkbenchFilterGroupLabel>Week</WorkbenchFilterGroupLabel>
        <div className="px-1 pb-1">
          <DateRangePickerPill
            label={formatWeekRangeCompact(weekRange.startStr, weekRange.endStr)}
            count={weekCount}
            weekNav={{ weekOffset, onPrev: onPrevWeek, onNext: onNextWeek }}
          />
        </div>
        {filterHot ? (
          <>
            <WorkbenchFilterDivider />
            <WorkbenchFilterMenuRow
              label="Clear filters"
              active={false}
              onClick={() => {
                clearFilters();
                setFilterOpen(false);
              }}
            />
          </>
        ) : null}
      </WorkbenchFilterPopover>
    </>
  );

  return (
    <WorkbenchTriageBand
      className={className}
      controlsSlotRef={controlsSlotRef}
      search={
        <TechRailSearchBar
          variant="chrome"
          value={urlQRaw}
          onChange={setHistorySearch}
          placeholder={placeholder}
          className="min-w-0 flex-1"
          trailingSuffix={inFieldRefine}
        />
      }
      trailing={
        <WorkbenchInspectorToggle
          open={historyInspectorOpen}
          testId="history-inspector-toggle"
        />
      }
    />
  );
}
