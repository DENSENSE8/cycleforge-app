'use client';

/**
 * History workbench chrome — dashboard-parity `WorkbenchChromeHeader` for
 * `?mode=history` on Receiving. Lifts search / scope / field / sort out of the
 * sidebar (`ReceivingHistorySearchSection`) into the top bar.
 *
 * Left:   carton-source tabs — All / Unfound.
 * Right:  [⌕ search] · [⫶ field / sort] · [calendar period].
 * Trailing: none — column display lives on the grid's top-right lip.
 * Row select lives in the table left gutter.
 */

import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { WorkbenchChromeHeader } from '@/components/dashboard/workbench-shell';
import {
  WorkbenchFilterDivider,
  WorkbenchFilterGroupLabel,
  WorkbenchFilterMenuRow,
  WorkbenchFilterPopover,
} from '@/components/dashboard/workbench-filter-popover';
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

interface HistoryWorkspaceHeaderProps {
  weekRange: { startStr: string; endStr: string };
  weekOffset: number;
  weekCount: number;
  onPrevWeek: () => void;
  onNextWeek: () => void;
}

export function HistoryWorkspaceHeader({
  weekRange,
  weekOffset,
  weekCount,
  onPrevWeek,
  onNextWeek,
}: HistoryWorkspaceHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const searchField = useMemo(
    () => normalizeReceivingHistorySearchField(searchParams.get(RECEIVING_HISTORY_URL_PARAMS.field)),
    [searchParams],
  );
  const searchScope = useMemo(
    () => normalizeReceivingHistorySearchScope(searchParams.get(RECEIVING_HISTORY_URL_PARAMS.scope)),
    [searchParams],
  );
  const historySort = useMemo(
    () => normalizeHistorySort(searchParams.get('sort')),
    [searchParams],
  );

  const replaceParams = useCallback(
    (next: URLSearchParams) => {
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const urlQRaw = searchParams.get(RECEIVING_HISTORY_URL_PARAMS.q) ?? '';

  const setHistorySearch = useCallback(
    (q: string) => {
      replaceParams(setReceivingHistoryUrlParams(searchParams, { q }));
    },
    [replaceParams, searchParams],
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

  const tabs: Array<{
    id: ReceivingHistorySearchScope;
    label: string;
    color: 'blue' | 'orange';
    dividerBefore?: boolean;
  }> = [
    { id: 'all', label: 'All', color: 'blue' },
    { id: 'unmatched', label: 'Unfound', color: 'orange', dividerBefore: true },
  ];

  const placeholder = getReceivingHistoryPlaceholder(searchField).replace(/^Search/, 'Filter');

  // No `trailing` cluster: History has no display sort and no chrome CTA, and
  // column display moved to the grid's own top-right lip (2026-08-02). Honest
  // absence — WorkbenchTrailingCluster would render null anyway.
  return (
    <WorkbenchChromeHeader
      density="band"
      tabs={tabs}
      activeTab={searchScope}
      onTabChange={setScope}
      solidTone="accent"
      search={
        <TechRailSearchBar
          variant="chrome"
          value={urlQRaw}
          onChange={setHistorySearch}
          placeholder={placeholder}
          className="w-40 shrink-0 lg:w-56"
        />
      }
      right={
        <>
          <WorkbenchFilterPopover
            open={filterOpen}
            onOpenChange={setFilterOpen}
            hot={filterHot}
            label="Filters"
          >
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

          <DateRangePickerPill
            label={formatWeekRangeCompact(weekRange.startStr, weekRange.endStr)}
            count={weekCount}
            weekNav={{
              weekOffset,
              onPrev: onPrevWeek,
              onNext: onNextWeek,
            }}
          />
        </>
      }
    />
  );
}
