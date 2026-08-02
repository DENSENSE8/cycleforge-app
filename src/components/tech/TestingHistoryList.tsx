'use client';

import { useCallback, useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import {
  ReceivingLineOrderRow,
  dispatchSelectLine,
  type ReceivingLineRow,
} from '@/components/station/ReceivingLinesTable';
import { useReceivingRowSelection } from '@/components/station/useReceivingRowSelection';
import { ReceivingGridView } from '@/components/station/receiving-grid/ReceivingGridView';
import { StationPipelineBoard } from '@/components/station/StationPipelineBoard';
import { STATION_PIPELINE_BOARDS } from '@/lib/station/flags';
import {
  LAYOUT_PARAM,
  SAVED_VIEW_PARAM_KEYS,
  SAVED_VIEW_STORAGE_KEY,
  WEEK_OFFSET_PARAM,
  parseLayout,
  parseWeekOffset,
} from '@/lib/station/table-url-params';
import { computeWeekRange, formatWeekRangeCompact, toPSTDateKey } from '@/utils/date';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Check, RefreshCw } from '@/components/Icons';
import type { SwimlaneLaneDef } from '@/components/board/SwimlaneBoard';
import {
  TESTING_HISTORY_BOARD_LANES,
  TESTING_HISTORY_STATE_META,
  bucketTestingHistoryLane,
  type TestingHistoryLane,
  type TestingLaneIconKey,
} from '@/lib/station/testing-board-lanes';
import { TESTING_RECEIVING_LINES_API } from '@/lib/surface-isolation';
import { STAFF_FILTER_PARAM, useStaffFilter } from '@/hooks/useStaffFilter';
import type { TestingWorkspaceTab } from '@/utils/testing-workspace-state';
import { useQueueDisplaySort } from '@/hooks/useQueueDisplaySort';
import { TableColumnConfigProvider } from '@/components/ui/table-column-config/TableColumnConfig';
import { TableDensityProvider } from '@/components/ui/table-density/TableDensityProvider';
import { TableOptionsMenu } from '@/components/ui/table-options/TableOptionsMenu';
import { DateRangePickerPill } from '@/components/ui/DateRangeHeader';
import { QueueTableToolbar } from '@/components/dashboard/queue-table';
import { WorkbenchTablePane } from '@/components/dashboard/workbench-shell';

const TESTING_LANE_ICON: Record<TestingLaneIconKey, React.ComponentType<{ className?: string }>> = {
  check: Check,
  alert: AlertTriangle,
  repeat: RefreshCw,
};

const TESTING_LANES: SwimlaneLaneDef<TestingHistoryLane>[] = TESTING_HISTORY_BOARD_LANES.map((lane) => ({
  id: lane.id,
  label: TESTING_HISTORY_STATE_META[lane.id].label,
  dot: TESTING_HISTORY_STATE_META[lane.id].dot,
  description: TESTING_HISTORY_STATE_META[lane.id].description,
  icon: TESTING_LANE_ICON[lane.iconKey],
  iconClass: lane.iconClass,
}));

/** Selection scope shared by the testing history list + its SelectionActionBar. */
export const TESTING_SELECTION_SCOPE = 'testing' as const;

interface ApiResponse {
  success: boolean;
  receiving_lines: ReceivingLineRow[];
  total: number;
}

interface TestingHistoryListProps {
  /** Signed-in tester id — History defaults to this operator when `?staff=` is absent. */
  staffId: string;
  mode?: TestingWorkspaceTab;
  /** Multi-select mode: rows show checkboxes; clicks toggle membership. */
  selectMode?: boolean;
  /** Non-select click → open the line in the testing workspace. */
  onOpenLine?: (row: ReceivingLineRow) => void;
  /** Portal display controls into the Testing workspace chrome. */
  toolbarPortalTarget?: HTMLElement | null;
}

/**
 * Full Testing workbench table for Pending, Returns, and History. Queue tabs
 * read `view=needs-test` with a server-owned return partition; History reads
 * `view=testing` and defaults to the signed-in tester unless staff=all.
 *
 * The sidebar's Recent rail remains a compact quick-reopen map. This table is
 * the searchable browse-and-bulk-act surface.
 */
export function TestingHistoryList({
  staffId,
  mode = 'history',
  selectMode = false,
  onOpenLine,
  toolbarPortalTarget = null,
}: TestingHistoryListProps) {
  const { isMobile } = useUIModeOptional();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { sort: displaySort } = useQueueDisplaySort();
  const parsed = staffId ? Number(staffId) : NaN;
  const ownTesterId = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  const { staffId: filteredStaffId } = useStaffFilter({ allToken: 'all' });
  const explicitlyAll =
    String(searchParams.get(STAFF_FILTER_PARAM) || '').trim().toLowerCase() === 'all';
  const testerId =
    mode === 'history'
      ? explicitlyAll
        ? null
        : (filteredStaffId ?? ownTesterId)
      : null;
  const search = String(searchParams.get('search') || '').trim();
  const view = mode === 'history' ? 'testing' : 'needs-test';
  const returnScope = mode === 'returns' ? 'returns' : mode === 'pending' ? 'standard' : 'all';
  const weekOffset =
    mode === 'history'
      ? Math.max(0, parseWeekOffset(searchParams.get(WEEK_OFFSET_PARAM)))
      : 0;
  const weekRange = useMemo(() => computeWeekRange(weekOffset), [weekOffset]);
  const setWeekOffset = useCallback(
    (next: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next <= 0) params.delete(WEEK_OFFSET_PARAM);
      else params.set(WEEK_OFFSET_PARAM, String(next));
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const { data, isLoading } = useQuery<ApiResponse>({
    queryKey: ['testing-workspace', mode, testerId ?? 'all', search, weekOffset],
    enabled: mode !== 'history' || ownTesterId != null || explicitlyAll,
    queryFn: async () => {
      if (mode === 'history' && testerId == null && !explicitlyAll) {
        return { success: true, receiving_lines: [], total: 0 };
      }
      const params = new URLSearchParams({
        limit: '500',
        offset: '0',
        include: 'serials',
        view,
      });
      if (testerId != null) params.set('tester', String(testerId));
      if (view === 'needs-test') params.set('return_scope', returnScope);
      if (view === 'testing') {
        params.set('weekStart', weekRange.startStr);
        params.set('weekEnd', weekRange.endStr);
      }
      if (search) params.set('search', search);
      const res = await fetch(`${TESTING_RECEIVING_LINES_API}?${params.toString()}`);
      if (!res.ok) throw new Error('fetch failed');
      return res.json();
    },
    staleTime: 20_000,
    refetchOnWindowFocus: true,
  });

  const rows = useMemo(
    () => (Array.isArray(data?.receiving_lines) ? data.receiving_lines : []),
    [data],
  );

  const emptyMessage =
    mode === 'pending'
      ? 'No standard intake is waiting for testing.'
      : mode === 'returns'
        ? 'No returns are waiting for quality control.'
        : ownTesterId == null && !explicitlyAll
          ? 'Sign in to see tested lines.'
          : 'No tested lines in this staff scope yet.';

  /**
   * Testing's record plane: open the line in the `TestingPanel` that covers
   * this browse (`TestingLineWorkspace`) — the same in-place open the Unbox
   * workbench does, so no navigation and no `openRow`-style destination change.
   * It is an override only because the open also has to tell the host
   * (`onOpenLine`), which the hook's bare dispatch has no slot for.
   */
  const openTestingLine = useCallback(
    (row: ReceivingLineRow) => {
      dispatchSelectLine(row);
      onOpenLine?.(row);
    },
    [onOpenLine],
  );

  const {
    selectedId,
    selectedIds,
    handleSelectRow,
    handleToggleRow,
    handleSelectGroup,
  } = useReceivingRowSelection({
    selectMode,
    // The two planes, split across ALL THREE tabs as a set. `browseActive`
    // pins `selectMode` ON (`useTechTestingSelection`), so before this the row
    // body was one big checkbox and the panel had no click gesture at all —
    // measured on dogfood: 5 rows this week / 20 at weekOffset=3, role
    // `checkbox`, zero `receiving-select-line` events on click.
    rowClickOpens: true,
    openRow: openTestingLine,
    // Testing broadcasts on its own bus — the tech dashboard mounts the bar.
    selectionScope: TESTING_SELECTION_SCOPE,
    localRows: rows,
    orderedVisibleRows: rows,
  });

  const renderLegacyBoardRow = useCallback(
    (row: ReceivingLineRow, index: number) => (
      <ReceivingLineOrderRow
        key={row.id}
        row={row}
        index={index}
        isMobile={isMobile}
        isHistory={mode === 'history'}
        activityAxis={mode === 'history' ? 'tested' : 'unboxed'}
        selectMode={selectMode}
        // Two planes on the board too: the tap opens, the gutter box selects.
        // Without `onToggleSelect` the split would leave the board's always-on
        // checkbox painted and its bulk set unreachable — the same dead gutter
        // this change set exists to remove.
        isSelected={selectedId === row.id}
        isChecked={selectMode && selectedIds.has(row.id)}
        onSelect={() => handleSelectRow(row)}
        onToggleSelect={selectMode ? () => handleToggleRow(row) : undefined}
      />
    ),
    [isMobile, mode, selectMode, selectedId, selectedIds, handleSelectRow, handleToggleRow],
  );

  const toDaySections = useCallback((recs: ReceivingLineRow[]): [string, ReceivingLineRow[]][] => {
    const byDay: Record<string, ReceivingLineRow[]> = {};
    for (const row of recs) {
      let key = 'Unknown';
      try {
        key =
          toPSTDateKey(
            row.tested_at ??
              row.last_activity_at ??
              row.unbox_opened_at ??
              row.updated_at ??
              row.created_at ??
              undefined,
          ) || 'Unknown';
      } catch {
        key = 'Unknown';
      }
      (byDay[key] ??= []).push(row);
    }
    const entries = Object.entries(byDay);
    // `newest` = recent days first; Priority/Deadline = oldest first (FIFO queue).
    if (displaySort === 'newest') {
      return entries.sort((a, b) => b[0].localeCompare(a[0]));
    }
    return entries.sort((a, b) => a[0].localeCompare(b[0]));
  }, [displaySort]);
  const daySections = useMemo(() => toDaySections(rows), [rows, toDaySections]);
  const boardEnabled = mode === 'history' && STATION_PIPELINE_BOARDS;
  const layout = boardEnabled ? parseLayout(searchParams.get(LAYOUT_PARAM)) : 'all';
  const setLayout = useCallback(
    (next: 'board' | 'all') => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'all') params.delete(LAYOUT_PARAM);
      else params.set(LAYOUT_PARAM, next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );
  const optionsMenu = (
    <TableOptionsMenu
      layout={boardEnabled ? { value: layout, onChange: setLayout } : undefined}
      savedViews={{
        storageKey: SAVED_VIEW_STORAGE_KEY.testing_history,
        paramKeys: SAVED_VIEW_PARAM_KEYS.testing_history,
      }}
    />
  );
  const portaledControls =
    mode === 'history' && toolbarPortalTarget
      ? createPortal(optionsMenu, toolbarPortalTarget)
      : null;
  const localHeaderOptions =
    mode === 'history' && !toolbarPortalTarget ? optionsMenu : undefined;

  const activityAxis = mode === 'history' ? 'tested' as const : 'unboxed' as const;
  const scopeLabel = mode === 'returns' ? 'Return queue' : mode === 'history' ? 'History' : 'Pending tests';

  const gridBody = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {mode !== 'history' ? (
        <QueueTableToolbar
          left={<DateRangePickerPill label={scopeLabel} count={rows.length} />}
        />
      ) : !toolbarPortalTarget ? (
        <QueueTableToolbar
          left={
            <DateRangePickerPill
              label={formatWeekRangeCompact(weekRange.startStr, weekRange.endStr)}
              count={rows.length}
              weekNav={{
                weekOffset,
                onPrev: () => setWeekOffset(weekOffset + 1),
                onNext: () => setWeekOffset(Math.max(0, weekOffset - 1)),
              }}
            />
          }
          right={localHeaderOptions}
        />
      ) : null}
      <ReceivingGridView
        daySections={daySections}
        loading={isLoading && rows.length === 0}
        emptyMessage={emptyMessage}
        isMobile={isMobile}
        selectMode={selectMode}
        selectedId={selectedId}
        selectedIds={selectedIds}
        handleSelectRow={handleSelectRow}
        // The row body belongs to the record plane now, so the gutter is the
        // only way left to build a bulk set — it must be a real control.
        handleToggleRow={handleToggleRow}
        handleSelectGroup={handleSelectGroup}
        activityAxis={activityAxis}
        isHistory={mode === 'history'}
        selectionScope={TESTING_SELECTION_SCOPE}
        testId="testing-grid-body"
      />
    </div>
  );

  let content: ReactNode;
  if (mode === 'history' && boardEnabled && layout === 'board') {
    content = (
      <div className="flex h-full min-w-0 flex-col overflow-hidden bg-surface-card">
        <StationPipelineBoard<ReceivingLineRow, TestingHistoryLane>
          prefsKey="testingHistoryBoard"
          lanes={TESTING_LANES}
          bucket={(row) => bucketTestingHistoryLane(row)}
          records={rows}
          loading={isLoading && rows.length === 0}
          renderRow={renderLegacyBoardRow}
          getRowKey={(row) => String(row.id)}
          toDaySections={toDaySections}
          getRowDate={(row) => row.tested_at ?? row.updated_at ?? row.created_at}
          headerStartSlot={
            <div className="flex items-center gap-2">
              <DateRangePickerPill
                label={formatWeekRangeCompact(weekRange.startStr, weekRange.endStr)}
                count={rows.length}
                weekNav={{
                  weekOffset,
                  onPrev: () => setWeekOffset(weekOffset + 1),
                  onNext: () => setWeekOffset(Math.max(0, weekOffset - 1)),
                }}
              />
            </div>
          }
          headerEndSlot={localHeaderOptions}
        />
      </div>
    );
  } else {
    content = (
      <div className="flex h-full min-w-0 flex-col overflow-hidden bg-surface-canvas">
        <WorkbenchTablePane>{gridBody}</WorkbenchTablePane>
      </div>
    );
  }

  return (
    <TableColumnConfigProvider tableId="testing">
      <TableDensityProvider tableId={mode === 'history' ? 'testing-history' : 'testing-queue'}>
        {mode === 'history' ? portaledControls : null}
        {content}
      </TableDensityProvider>
    </TableColumnConfigProvider>
  );
}
