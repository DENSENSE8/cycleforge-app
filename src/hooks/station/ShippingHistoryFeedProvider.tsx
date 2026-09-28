'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'next/navigation';
import { computeWeekRange, type WeekRange } from '@/utils/date';
import { useDeskPickLogs, type DeskPickLogsScope } from '@/hooks/useDeskPickLogs';
import { useStaffFilter } from '@/hooks/useStaffFilter';
import { STAFF_FILTER_PARAM } from '@/lib/station/table-url-params';
import { dedupeDeskPickRecords, getDeskPickRecordRowKey } from '@/lib/station/dedupe-tech-records';
import type { DeskPickRecord } from '@/hooks/useDeskPickLogs';

interface ShippingHistoryFeedContextValue {
  /** Resolved staff scope — session tech by default, `all` when `?staff=all`. */
  staffId: DeskPickLogsScope;
  weekOffset: number;
  setWeekOffset: (next: number | ((prev: number) => number)) => void;
  weekRange: WeekRange;
  records: DeskPickRecord[];
  loading: boolean;
  isRefreshing: boolean;
  getRowKey: (record: DeskPickRecord) => string;
  /** The find box text, shared for the same reason `weekOffset` is: */
  query: string;
  setQuery: (next: string) => void;
}

const ShippingHistoryFeedContext = createContext<ShippingHistoryFeedContextValue | null>(null);

interface ShippingHistoryFeedProviderProps {
  /** Signed-in tech id — default staff scope when `?staff=` is absent. */
  techId: string;
  children: ReactNode;
}

/**
 * Shared History feed scope for Shipping mode — one week offset + staff filter
 * drives both the sidebar rail and the History tab (`DeskPickTable`).
 */
export function ShippingHistoryFeedProvider({ techId, children }: ShippingHistoryFeedProviderProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const { staffId: urlStaffId } = useStaffFilter({ allToken: 'all' });
  const searchParams = useSearchParams();
  const rawStaff = searchParams.get(STAFF_FILTER_PARAM);
  const wantAllExplicit = String(rawStaff || '').trim().toLowerCase() === 'all';
  const parsedTechId = parseInt(techId, 10);
  const sessionTechId = Number.isFinite(parsedTechId) && parsedTechId > 0 ? parsedTechId : 0;

  const staffId: DeskPickLogsScope = wantAllExplicit
    ? 'all'
    : (urlStaffId ?? sessionTechId);

  const [query, setQuery] = useState('');
  const weekRange = useMemo(() => computeWeekRange(weekOffset), [weekOffset]);
  const { data: rawRecords = [], isLoading, isFetching } = useDeskPickLogs(staffId, {
    weekOffset,
    weekRange,
    search: query,
  });

  const records = useMemo(() => dedupeDeskPickRecords(rawRecords), [rawRecords]);
  const loading = isLoading && records.length === 0;
  const isRefreshing = isFetching && !isLoading;

  const getRowKey = useCallback((record: DeskPickRecord) => getDeskPickRecordRowKey(record), []);

  const value = useMemo<ShippingHistoryFeedContextValue>(
    () => ({
      staffId,
      weekOffset,
      setWeekOffset,
      weekRange,
      records,
      loading,
      isRefreshing,
      getRowKey,
      query,
      setQuery,
    }),
    [staffId, weekOffset, weekRange, records, loading, isRefreshing, getRowKey, query],
  );

  return (
    <ShippingHistoryFeedContext.Provider value={value}>
      {children}
    </ShippingHistoryFeedContext.Provider>
  );
}

/** Returns the shared feed when inside {@link ShippingHistoryFeedProvider}, else null. */
export function useShippingHistoryFeedOptional(): ShippingHistoryFeedContextValue | null {
  return useContext(ShippingHistoryFeedContext);
}
