'use client';

import { useCallback, useMemo } from 'react';
import { type PackerRecord } from '@/hooks/usePackerLogs';
import { useStaffFilter } from '@/hooks/useStaffFilter';
import { usePackerTableController } from '@/hooks/station/usePackerTableController';
import { useStationDetailsSelection } from '@/hooks/station/useStationDetailsSelection';
import { StationHistoryTable } from '@/components/station/StationHistoryTable';
import { usePackerTableLayout } from '@/components/station/bench-grid/usePackerTableLayout';
import { packerRecordToDetail, getPackerDetailId } from '@/components/station/packer-record-mappers';
import { SAVED_VIEW_PARAM_KEYS, SAVED_VIEW_STORAGE_KEY } from '@/lib/station/table-url-params';
import { AlertTriangle, Calendar, Clock, Package } from '@/components/Icons';
import { toPSTDateKey } from '@/utils/date';
import type { SwimlaneLaneDef } from '@/components/board/SwimlaneBoard';
import {
  PACKER_HISTORY_BOARD_LANES,
  PACKER_HISTORY_STATE_META,
  bucketPackerHistoryLane,
  type PackerHistoryLane,
  type PackerLaneIconKey,
} from '@/lib/station/packer-board-lanes';
import { packerRecordToQueueRow } from '@/lib/station/record-to-queue-row';
import { formatPackerCopyRow, PACKER_COPY_HEADER } from '@/lib/station/format-station-copy-row';
import { PACKER_HISTORY_SELECTION_SCOPE } from '@/lib/selection/station-scopes';

const PACKER_LANE_ICON: Record<PackerLaneIconKey, React.ComponentType<{ className?: string }>> = {
  clock: Clock,
  calendar: Calendar,
  package: Package,
  alert: AlertTriangle,
};

const PACKER_LANES: SwimlaneLaneDef<PackerHistoryLane>[] = PACKER_HISTORY_BOARD_LANES.map((lane) => ({
  id: lane.id,
  label: PACKER_HISTORY_STATE_META[lane.id].label,
  dot: PACKER_HISTORY_STATE_META[lane.id].dot,
  description: PACKER_HISTORY_STATE_META[lane.id].description,
  icon: PACKER_LANE_ICON[lane.iconKey],
  iconClass: lane.iconClass,
}));

interface PackerTableProps {
  packedBy: number;
}

/** Newest-first by pack time (created_at). */
function byNewestCreated(a: PackerRecord, b: PackerRecord): number {
  return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
}

export function PackerTable({ packedBy }: PackerTableProps) {
  // Shared `?staff=` header filter (P1-WORK-02) — the pack scan column header's
  // StaffFilterButton writes it; when set it swaps whose pack history renders.
  // Absent (the default) = the signed-in packer's own logs, unchanged.
  const { staffId: staffFilterId } = useStaffFilter();
  const {
    weekOffset,
    setWeekOffset,
    weekRange,
    filteredGroupedRecords,
    orderedRecords,
    loading,
    isRefreshing,
    query,
    setQuery,
  } = usePackerTableController({ staffId: staffFilterId ?? packedBy });
  const packerLayout = usePackerTableLayout();

  // Day bands (newest day first, each day newest-first) for rendering. The
  // controller's `orderedRecords` drives keyboard navigation.
  const daySections = useMemo<[string, PackerRecord[]][]>(
    () =>
      Object.entries(filteredGroupedRecords)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([date, recs]) => [date, [...recs].sort(byNewestCreated)] as [string, PackerRecord[]]),
    [filteredGroupedRecords],
  );

  const { openDetails } = useStationDetailsSelection<PackerRecord>({
    orderedRecords,
    toDetailRecord: packerRecordToDetail,
    getDetailId: getPackerDetailId,
  });

  // Pipeline (board) grouping: bucket by the packer lane SoT, day-band per lane.
  const todayKey = toPSTDateKey(new Date());
  const packerBucket = useCallback((r: PackerRecord) => bucketPackerHistoryLane(r, todayKey), [todayKey]);
  const toLaneDaySections = useCallback((recs: PackerRecord[]): [string, PackerRecord[]][] => {
    const byDay: Record<string, PackerRecord[]> = {};
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
      .map(([date, recs2]) => [date, [...recs2].sort(byNewestCreated)] as [string, PackerRecord[]]);
  }, []);

  return (
    <StationHistoryTable<PackerRecord>
      loading={loading}
      weekRange={weekRange}
      weekOffset={weekOffset}
      onPrevWeek={() => setWeekOffset(weekOffset + 1)}
      onNextWeek={() => setWeekOffset(Math.max(0, weekOffset - 1))}
      onResetWeek={() => setWeekOffset(0)}
      daySections={daySections}
      family="packer"
      layout={packerLayout}
      savedViewsStorageKey={SAVED_VIEW_STORAGE_KEY.packer_history}
      savedViewsParamKeys={SAVED_VIEW_PARAM_KEYS.packer_history}
      // History is WEEK-scoped, so an empty view is a no-results state, not a
      // first run — hence no `firstRunEmpty`. Passing one also suppressed the
      // shell's "back to this week" reset button (it only renders on the
      // emptyMessage branch), and the state it passed was the Home task-inbox
      // "No work assigned" — work-assignment copy on a scan-history surface.
      emptyMessage="No packs recorded this week"
      // The find box is answered by `/api/packerlogs?q=`, not by a pass over
      // the mounted week. `isRefreshing` is the in-flight flag for the CURRENT
      // text, so the body holds its loading face instead of presenting the
      // previous query's rows as this query's answer.
      search={{ value: query, onChange: setQuery, pending: isRefreshing }}
      pipeline={{
        records: orderedRecords,
        lanes: PACKER_LANES,
        bucket: packerBucket,
        prefsKey: 'packerHistoryBoard',
        toDaySections: toLaneDaySections,
        getRowDate: (r) => r.created_at,
      }}
      selection={{
        scope: PACKER_HISTORY_SELECTION_SCOPE,
        queueMode: 'packer',
        toQueueRow: packerRecordToQueueRow,
        getRecordId: (r) => r.id,
        onOpen: openDetails,
        formatCopyRow: formatPackerCopyRow,
        copyHeader: PACKER_COPY_HEADER,
        deepLinkParam: 'packLogId',
      }}
    />
  );
}
