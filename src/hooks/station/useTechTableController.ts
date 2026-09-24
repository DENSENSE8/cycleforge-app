import { useCallback, useMemo, useRef, useState } from 'react';
import { computeWeekRange } from '@/utils/date';
import { toPSTDateKey } from '@/utils/date';
import { useTechLogs, type TechRecord } from '@/hooks/useTechLogs';
import {
  dedupeTechRecords,
  getTechRecordRowKey,
} from '@/lib/station/dedupe-tech-records';
import { useShippingHistoryFeedOptional } from '@/hooks/station/ShippingHistoryFeedProvider';

export { hasUsableProductTitle, isFbaTechRecord } from '@/lib/station/dedupe-tech-records';

export interface GroupedRecords {
  [dateKey: string]: TechRecord[];
}

interface UseTechTableControllerOptions {
  staffId: number | 'all';
}

export function useTechTableController({ staffId }: UseTechTableControllerOptions) {
  const sharedFeed = useShippingHistoryFeedOptional();
  const useSharedScope = sharedFeed != null && sharedFeed.staffId === staffId;

  const [localWeekOffset, setLocalWeekOffset] = useState(0);
  const weekOffset = useSharedScope ? sharedFeed.weekOffset : localWeekOffset;
  const setWeekOffset = useSharedScope ? sharedFeed.setWeekOffset : setLocalWeekOffset;

  /**
   * The find box text, ANSWERED BY THE SERVER — it rides `useTechLogs`' fetch
   * key, so `records` already ARE the answer for it and nothing filters them
   * again here. It follows `weekOffset`'s ownership rule exactly: under the
   * Shipping History provider the rail and the tab share ONE feed, so they
   * must share the query too — a local copy would send this table's text to a
   * fetch this hook does not own and the box would answer with the rail's rows.
   */
  const [localQuery, setLocalQuery] = useState('');
  const query = useSharedScope ? sharedFeed.query : localQuery;
  const setQuery = useSharedScope ? sharedFeed.setQuery : setLocalQuery;

  const localWeekRange = useMemo(() => computeWeekRange(localWeekOffset), [localWeekOffset]);
  const { data: localRecords = [], isLoading: localLoading, isFetching: localFetching } = useTechLogs(
    staffId,
    {
      weekOffset: localWeekOffset,
      weekRange: localWeekRange,
      search: localQuery,
      enabled: !useSharedScope,
    },
  );

  const [removedRowKeys, setRemovedRowKeys] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const getRowKey = useCallback((record: TechRecord) => getTechRecordRowKey(record), []);

  const records = useSharedScope ? sharedFeed.records : dedupeTechRecords(localRecords);
  const weekRange = useSharedScope ? sharedFeed.weekRange : localWeekRange;
  const loading = useSharedScope
    ? sharedFeed.loading
    : localLoading && localRecords.length === 0;
  const isRefreshing = useSharedScope
    ? sharedFeed.isRefreshing
    : localFetching && !localLoading;

  const visibleRecords = useMemo(
    () => records.filter((record) => !removedRowKeys.has(getRowKey(record))),
    [records, removedRowKeys, getRowKey],
  );

  const groupedRecords = useMemo(() => {
    const groups: GroupedRecords = {};
    visibleRecords.forEach((record) => {
      if (!record.created_at) return;
      let date = '';
      try {
        date = toPSTDateKey(record.created_at) || 'Unknown';
      } catch {
        date = 'Unknown';
      }
      if (!groups[date]) groups[date] = [];
      groups[date].push(record);
    });
    return groups;
  }, [visibleRecords]);

  return {
    weekOffset,
    setWeekOffset,
    weekRange,
    records,
    visibleRecords,
    groupedRecords,
    loading,
    isRefreshing,
    getRowKey,
    removedRowKeys,
    setRemovedRowKeys,
    query,
    setQuery,
    scrollRef,
  };
}
