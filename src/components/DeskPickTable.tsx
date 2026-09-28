'use client';

import { useCallback, useMemo } from 'react';
import { useEventBridge } from '@/hooks';
import { type DeskPickRecord } from '@/hooks/useDeskPickLogs';
import { useDeskPickTableController } from '@/hooks/station/useDeskPickTableController';
import { useStationDetailsSelection } from '@/hooks/station/useStationDetailsSelection';
import { StationHistoryTable } from '@/components/station/StationHistoryTable';
import { useDeskPickTableLayout } from '@/components/station/bench-grid/useDeskPickTableLayout';
import { techRecordToDetail, getTechDetailId } from '@/components/station/tech-record-mappers';
import { SAVED_VIEW_PARAM_KEYS, SAVED_VIEW_STORAGE_KEY, STAFF_FILTER_PARAM } from '@/lib/station/table-url-params';
import { Calendar, Clock, Package } from '@/components/Icons';
import { toPSTDateKey } from '@/utils/date';
import type { SwimlaneLaneDef } from '@/components/board/SwimlaneBoard';
import {
  TECH_HISTORY_BOARD_LANES,
  TECH_HISTORY_STATE_META,
  bucketTechHistoryLane,
  type TechHistoryLane,
  type TechLaneIconKey,
} from '@/lib/station/tech-board-lanes';
import { techRecordToQueueRow } from '@/lib/station/record-to-queue-row';
import { formatTechCopyRow, TECH_COPY_HEADER } from '@/lib/station/format-station-copy-row';
import { TECH_HISTORY_SELECTION_SCOPE } from '@/lib/selection/station-scopes';
import { ContextualEmptyState } from '@/components/ui/ContextualEmptyState';
import { useStaffFilter } from '@/hooks/useStaffFilter';
import { useSearchParams } from 'next/navigation';

const TECH_LANE_ICON: Record<TechLaneIconKey, React.ComponentType<{ className?: string }>> = {
  clock: Clock,
  calendar: Calendar,
  package: Package,
};

/** Resolve the lane SoT descriptors + meta into the board's SwimlaneLaneDef. */
const TECH_LANES: SwimlaneLaneDef<TechHistoryLane>[] = TECH_HISTORY_BOARD_LANES.map((lane) => ({
  id: lane.id,
  label: TECH_HISTORY_STATE_META[lane.id].label,
  dot: TECH_HISTORY_STATE_META[lane.id].dot,
  description: TECH_HISTORY_STATE_META[lane.id].description,
  icon: TECH_LANE_ICON[lane.iconKey],
  iconClass: lane.iconClass,
}));

interface DeskPickTableProps {
  /** Signed-in tech — used when `staffScope` is `'self'` (legacy default). */
  testedBy: number;
  /** `'self'` — always this tech (legacy DeskPickTable callers). */
  staffScope?: 'self' | 'url' | 'url-or-self';
}

/** Newest-first by pack/test time (created_at). */
function byNewestCreated(a: DeskPickRecord, b: DeskPickRecord): number {
  return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
}

export function DeskPickTable({
  testedBy,
  staffScope = 'self',
}: DeskPickTableProps) {
  const { staffId: urlStaffId } = useStaffFilter(
    staffScope === 'url-or-self' ? { allToken: 'all' } : undefined,
  );
  const searchParams = useSearchParams();
  const rawStaff = searchParams.get(STAFF_FILTER_PARAM);
  const wantAllExplicit = String(rawStaff || '').trim().toLowerCase() === 'all';
  const staffId: number | 'all' =
    staffScope === 'self'
      ? testedBy
      : staffScope === 'url-or-self'
        ? wantAllExplicit
          ? 'all'
          : (urlStaffId ?? testedBy)
        : (urlStaffId ?? 'all');

  const {
    weekOffset, setWeekOffset, weekRange,
    groupedRecords, loading, isRefreshing,
    query, setQuery,
    setRemovedRowKeys,
  } = useDeskPickTableController({ staffId });
  const techLayout = useDeskPickTableLayout();

  // Week-scoped day bands (newest day first, each day newest-first).
  const daySections = useMemo<[string, DeskPickRecord[]][]>(
    () =>
      Object.entries(groupedRecords)
        .filter(([date]) => date >= weekRange.startStr && date <= weekRange.endStr)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([date, recs]) => [date, [...recs].sort(byNewestCreated)] as [string, DeskPickRecord[]]),
    [groupedRecords, weekRange.startStr, weekRange.endStr],
  );
  const orderedRecords = useMemo(() => daySections.flatMap(([, recs]) => recs), [daySections]);

  // Pipeline (board) grouping: bucket by the tech lane SoT, day-band per lane.
  const todayKey = toPSTDateKey(new Date());
  const techBucket = useCallback((r: DeskPickRecord) => bucketTechHistoryLane(r, todayKey), [todayKey]);
  const toLaneDaySections = useCallback((recs: DeskPickRecord[]): [string, DeskPickRecord[]][] => {
    const byDay: Record<string, DeskPickRecord[]> = {};
    for (const r of recs) {
      let key = 'Unknown';
      try {
        key = toPSTDateKey(r.created_at) || 'Unknown';
      } catch {
        key = 'Unknown';
      }
      (byDay[key] ??= []).push(r);
    }
    return Object.entries(byDay)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, recs2]) => [date, [...recs2].sort(byNewestCreated)] as [string, DeskPickRecord[]]);
  }, []);

  const { openDetails, clearSelection } = useStationDetailsSelection<DeskPickRecord>({
    orderedRecords,
    toDetailRecord: techRecordToDetail,
    getDetailId: getTechDetailId,
  });

  // A removed tech log drops out optimistically and closes any open detail.
  useEventBridge({
    'tech-log-removed': (e) => {
      const detail = (e as CustomEvent<{ sourceKind?: unknown; sourceRowId?: unknown }>).detail;
      const sourceKind = String(detail?.sourceKind || '').trim();
      const sourceRowId = Number(detail?.sourceRowId);
      if (!sourceKind || !Number.isFinite(sourceRowId) || sourceRowId <= 0) return;
      setRemovedRowKeys((current) => {
        const next = new Set(current);
        next.add(`${sourceKind}:${sourceRowId}`);
        return next;
      });
      clearSelection();
    },
  });

  return (
    <StationHistoryTable<DeskPickRecord>
      loading={loading}
      weekRange={weekRange}
      weekOffset={weekOffset}
      onPrevWeek={() => setWeekOffset(weekOffset + 1)}
      onNextWeek={() => setWeekOffset(Math.max(0, weekOffset - 1))}
      onResetWeek={() => setWeekOffset(0)}
      daySections={daySections}
      family="tech"
      layout={techLayout}
      savedViewsStorageKey={SAVED_VIEW_STORAGE_KEY.tech_history}
      savedViewsParamKeys={SAVED_VIEW_PARAM_KEYS.tech_history}
      emptyMessage="No tech records found"
      firstRunEmpty={<ContextualEmptyState state="no-work" />}
      // The find box is answered by `/api/picking/desk/logs?q=`, not by a pass over the mounted week.
      search={{ value: query, onChange: setQuery, pending: isRefreshing }}
      pipeline={{
        records: orderedRecords,
        lanes: TECH_LANES,
        bucket: techBucket,
        prefsKey: 'techHistoryBoard',
        toDaySections: toLaneDaySections,
        getRowDate: (r) => r.created_at,
      }}
      selection={{
        scope: TECH_HISTORY_SELECTION_SCOPE,
        queueMode: 'tech',
        toQueueRow: techRecordToQueueRow,
        getRecordId: (r) => r.id,
        onOpen: openDetails,
        formatCopyRow: formatTechCopyRow,
        copyHeader: TECH_COPY_HEADER,
        deepLinkParam: 'techLogId',
      }}
    />
  );
}
