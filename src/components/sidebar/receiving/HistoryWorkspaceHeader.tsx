'use client';

/**
 * History workbench chrome — dashboard-parity `WorkbenchChromeHeader` for
 * `?mode=history` on Receiving. Lifts search / scope / field / sort out of the
 * sidebar (`ReceivingHistorySearchSection`) into the top bar.
 *
 * Left:   carton-source tabs — All / Unfound.
 * Right:  [⌕ search] · [⫶ field / sort] · [calendar period].
 * Trailing: Fields (`WorkbenchTrailingCluster`).
 * Row select lives in the table left gutter.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { WorkbenchChromeHeader, WorkbenchTrailingCluster } from '@/components/dashboard/workbench-shell';
import {
  WorkbenchFilterDivider,
  WorkbenchFilterGroupLabel,
  WorkbenchFilterMenuRow,
  WorkbenchFilterPopover,
} from '@/components/dashboard/workbench-filter-popover';
import { ToolbarSearchToggle } from '@/components/ui/ToolbarSearchToggle';
import { DateRangePickerPill } from '@/components/ui/DateRangeHeader';
import { GridFieldsMenu } from '@/components/ui/table-column-config/GridFieldsMenu';
import { RECEIVING_GRID_COLUMNS } from '@/lib/receiving/receiving-grid-layout';
import { useDebounce } from '@/hooks';
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
  const [draft, setDraft] = useState(urlQRaw);
  useEffect(() => {
    setDraft(urlQRaw);
  }, [urlQRaw]);
  const debouncedDraft = useDebounce(draft, 250);
  useEffect(() => {
    if (debouncedDraft.trim() === urlQRaw.trim()) return;
    replaceParams(setReceivingHistoryUrlParams(searchParams, { q: debouncedDraft }));
  }, [debouncedDraft, replaceParams, searchParams, urlQRaw]);

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

  return (
    <WorkbenchChromeHeader
      tabs={tabs}
      activeTab={searchScope}
      onTabChange={setScope}
      solidTone="accent"
      search={
        <ToolbarSearchToggle
          value={draft}
          onChange={setDraft}
          onClear={() => {
            setDraft('');
            replaceParams(setReceivingHistoryUrlParams(searchParams, { q: '' }));
          }}
          placeholder={placeholder}
          tone="blue"
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
      trailing={
        <WorkbenchTrailingCluster
          fields={<GridFieldsMenu tableId="receiving" columns={RECEIVING_GRID_COLUMNS} />}
        />
      }
    />
  );
}
