import { useMemo, useRef, useState } from 'react';
import { computeWeekRange, toPSTDateKey } from '@/utils/date';
import { isFbaOrder } from '@/utils/order-platform';
import { usePackerLogs, type PackerRecord } from '@/hooks/usePackerLogs';

// ─── Helpers ────────────────────────────────────────────────────────────────

function isFbaPackerRecord(record: PackerRecord): boolean {
  return (
    isFbaOrder(record.order_id, record.account_source) ||
    String(record.tracking_type || '').toUpperCase() === 'FNSKU'
  );
}

export interface GroupedPackerRecords {
  [dateKey: string]: PackerRecord[];
}

// ─── Hook ───────────────────────────────────────────────────────────────────

interface UsePackerTableControllerOptions {
  staffId: number;
}

export function usePackerTableController({ staffId }: UsePackerTableControllerOptions) {
  const [weekOffset, setWeekOffset] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  /**
   * The find box text, ANSWERED BY THE SERVER — it rides `usePackerLogs`'
   * fetch key, so `records` already ARE the answer for it.
   *
   * This used to be a `searchTerm` PROP filtered in memory a few lines down,
   * over whatever the `limit=1000` week fetch had mounted. That is how a pack
   * from earlier in the same week returned "no results" for a tracking number
   * the operator was holding. Owning the state here is what lets it reach the
   * fetch key at all; the substring pass is gone rather than kept as a second,
   * narrower opinion (it never saw the serial, the tester's name, the FNSKU
   * title, or anything past row 1000).
   */
  const [query, setQuery] = useState('');

  const weekRange = computeWeekRange(weekOffset);
  const { data: records = [], isLoading, isFetching } = usePackerLogs(staffId, {
    weekOffset,
    weekRange,
    search: query,
  });
  const loading = isLoading && records.length === 0;
  const isRefreshing = isFetching && !isLoading;

  // ── Deduplication ─────────────────────────────────────────────────────────

  const dedupedRecords = useMemo(() => {
    const seenTracking = new Map<string, PackerRecord>();
    [...records].sort((a, b) => a.id - b.id).forEach((record) => {
      if (isFbaPackerRecord(record)) {
        seenTracking.set(`fba:${record.id}`, record);
        return;
      }
      const key = (record.shipping_tracking_number || record.scan_ref || String(record.id)).trim();
      seenTracking.set(key, record);
    });
    return Array.from(seenTracking.values());
  }, [records]);

  // ── Day grouping ──────────────────────────────────────────────────────────
  //
  // Straight off the deduped rows. There is no search pass between the two any
  // more: the query text was spent on the fetch key, so `records` are already
  // the server's answer for it, and the substring filter that used to sit here
  // could only ever see the mounted `limit=1000` window.

  const groupedRecords = useMemo(() => {
    const groups: GroupedPackerRecords = {};
    dedupedRecords.forEach((record) => {
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
  }, [dedupedRecords]);

  const filteredGroupedRecords = useMemo(() =>
    Object.fromEntries(
      Object.entries(groupedRecords).filter(([date]) => date >= weekRange.startStr && date <= weekRange.endStr),
    ),
    [groupedRecords, weekRange.startStr, weekRange.endStr],
  );

  const orderedRecords = useMemo(() =>
    Object.entries(filteredGroupedRecords)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .flatMap(([, dateRecords]) =>
        [...dateRecords].sort((a, b) => {
          const timeA = new Date(a.created_at || 0).getTime();
          const timeB = new Date(b.created_at || 0).getTime();
          return timeB - timeA;
        }),
      ),
    [filteredGroupedRecords],
  );

  return {
    weekOffset,
    setWeekOffset,
    weekRange,
    records,
    dedupedRecords,
    groupedRecords,
    filteredGroupedRecords,
    orderedRecords,
    loading,
    isRefreshing,
    query,
    setQuery,
    scrollRef,
  };
}
