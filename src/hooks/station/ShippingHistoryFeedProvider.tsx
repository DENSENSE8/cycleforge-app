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
import { useTechLogs, type TechLogsScope } from '@/hooks/useTechLogs';
import { STAFF_FILTER_PARAM, useStaffFilter } from '@/hooks/useStaffFilter';
import { dedupeTechRecords, getTechRecordRowKey } from '@/lib/station/dedupe-tech-records';
import type { TechRecord } from '@/hooks/useTechLogs';

export interface ShippingHistoryFeedContextValue {
  /** Resolved staff scope — session tech by default, `all` when `?staff=all`. */
  staffId: TechLogsScope;
  weekOffset: number;
  setWeekOffset: (next: number | ((prev: number) => number)) => void;
  weekRange: WeekRange;
  records: TechRecord[];
  loading: boolean;
  isRefreshing: boolean;
  getRowKey: (record: TechRecord) => string;
}

const ShippingHistoryFeedContext = createContext<ShippingHistoryFeedContextValue | null>(null);

export interface ShippingHistoryFeedProviderProps {
  /** Signed-in tech id — default staff scope when `?staff=` is absent. */
  techId: string;
  children: ReactNode;
}

/**
 * Shared History feed scope for Shipping mode — one week offset + staff filter
 * drives both the sidebar rail and the History tab (`TechTable`).
 */
export function ShippingHistoryFeedProvider({ techId, children }: ShippingHistoryFeedProviderProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const { staffId: urlStaffId } = useStaffFilter({ allToken: 'all' });
  const searchParams = useSearchParams();
  const rawStaff = searchParams.get(STAFF_FILTER_PARAM);
  const wantAllExplicit = String(rawStaff || '').trim().toLowerCase() === 'all';
  const parsedTechId = parseInt(techId, 10);
  const sessionTechId = Number.isFinite(parsedTechId) && parsedTechId > 0 ? parsedTechId : 0;

  const staffId: TechLogsScope = wantAllExplicit
    ? 'all'
    : (urlStaffId ?? sessionTechId);

  const weekRange = useMemo(() => computeWeekRange(weekOffset), [weekOffset]);
  const { data: rawRecords = [], isLoading, isFetching } = useTechLogs(staffId, {
    weekOffset,
    weekRange,
  });

  const records = useMemo(() => dedupeTechRecords(rawRecords), [rawRecords]);
  const loading = isLoading && records.length === 0;
  const isRefreshing = isFetching && !isLoading;

  const getRowKey = useCallback((record: TechRecord) => getTechRecordRowKey(record), []);

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
    }),
    [staffId, weekOffset, weekRange, records, loading, isRefreshing, getRowKey],
  );

  return (
    <ShippingHistoryFeedContext.Provider value={value}>
      {children}
    </ShippingHistoryFeedContext.Provider>
  );
}

export function useShippingHistoryFeed(): ShippingHistoryFeedContextValue {
  const ctx = useContext(ShippingHistoryFeedContext);
  if (!ctx) {
    throw new Error('useShippingHistoryFeed must be used within ShippingHistoryFeedProvider');
  }
  return ctx;
}

/** Optional accessor — returns null outside the provider (e.g. legacy embeds). */
export function useShippingHistoryFeedOptional(): ShippingHistoryFeedContextValue | null {
  return useContext(ShippingHistoryFeedContext);
}
