'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { SkeletonList } from '@/design-system/components/Skeletons';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import {
  ReceivingLineOrderRow,
  dispatchSelectLine,
  type ReceivingLineRow,
} from '@/components/station/ReceivingLinesTable';
import { emitSelection, emitSelectionTotal, onToggleAll } from '@/lib/selection/table-selection';
import { StationListTable } from '@/components/station/StationListTable';
import {
  QueueTableShell,
  QueueTableToolbar,
  StationRowColumnHeader,
} from '@/components/dashboard/queue-table';
import { StationPipelineBoard } from '@/components/station/StationPipelineBoard';
import { STATION_PIPELINE_BOARDS, STATION_VIRTUAL_LIST } from '@/lib/station/flags';
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
import { TableColumnConfigProvider } from '@/components/ui/table-column-config/TableColumnConfig';
import { ColumnConfigButton } from '@/components/ui/table-column-config/ColumnConfigButton';
import { TableDensityProvider } from '@/components/ui/table-density/TableDensityProvider';
import { TableOptionsMenu } from '@/components/ui/table-options/TableOptionsMenu';
import { DateRangePickerPill } from '@/components/ui/DateRangeHeader';

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

  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());

  // Broadcast resolved selection whenever the id set or rows change.
  useEffect(() => {
    if (!selectMode) return;
    const byId = new Map(rows.map((r) => [r.id, r]));
    const selected: ReceivingLineRow[] = [];
    for (const id of selectedIds) {
      const row = byId.get(id);
      if (row) selected.push(row);
    }
    emitSelection(TESTING_SELECTION_SCOPE, selected);
  }, [selectMode, selectedIds, rows]);

  // Leaving select mode clears the selection.
  useEffect(() => {
    if (selectMode) return;
    setSelectedIds((prev) => (prev.size ? new Set() : prev));
    emitSelection(TESTING_SELECTION_SCOPE, []);
  }, [selectMode]);

  // Header "Select all" / "Clear".
  useEffect(() => {
    return onToggleAll(TESTING_SELECTION_SCOPE, (mode) => {
      setSelectedIds(mode === 'all' ? new Set(rows.map((r) => r.id)) : new Set());
    });
  }, [rows]);

  // Publish the selectable total so the action bar's select-all ring can fill.
  useEffect(() => {
    emitSelectionTotal(TESTING_SELECTION_SCOPE, selectMode ? rows.length : 0);
  }, [selectMode, rows]);

  const selectModeRef = useRef(selectMode);
  useEffect(() => { selectModeRef.current = selectMode; }, [selectMode]);

  const handleSelect = useCallback((row: ReceivingLineRow) => {
    if (selectModeRef.current) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(row.id)) next.delete(row.id);
        else next.add(row.id);
        return next;
      });
      return;
    }
    dispatchSelectLine(row);
    onOpenLine?.(row);
  }, [onOpenLine]);

  const renderRow = useCallback(
    (row: ReceivingLineRow, index: number) => (
      <ReceivingLineOrderRow
        key={row.id}
        row={row}
        index={index}
        isMobile={isMobile}
        isHistory={mode === 'history'}
        selectMode={selectMode}
        isSelected={selectMode ? selectedIds.has(row.id) : false}
        onSelect={() => handleSelect(row)}
      />
    ),
    [isMobile, mode, selectMode, selectedIds, handleSelect],
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
    return Object.entries(byDay).sort((a, b) => b[0].localeCompare(a[0]));
  }, []);
  const daySections = useMemo(() => toDaySections(rows), [rows, toDaySections]);
  const boardEnabled =
    mode === 'history' && STATION_VIRTUAL_LIST && STATION_PIPELINE_BOARDS;
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
  const toolbarControls = (
    <div className="flex items-center gap-2">
      <ColumnConfigButton variant="toolbar" />
      {optionsMenu}
    </div>
  );
  const portaledControls =
    mode === 'history' && toolbarPortalTarget
      ? createPortal(toolbarControls, toolbarPortalTarget)
      : null;
  const localHeaderColumns =
    mode === 'history' && !toolbarPortalTarget ? <ColumnConfigButton iconOnly /> : undefined;
  const localHeaderOptions =
    mode === 'history' && !toolbarPortalTarget ? optionsMenu : undefined;

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
          renderRow={renderRow}
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
              {localHeaderColumns}
            </div>
          }
          headerEndSlot={localHeaderOptions}
        />
      </div>
    );
  } else if (mode === 'history' || STATION_VIRTUAL_LIST) {
    content = (
      <div className="flex h-full min-w-0 flex-col overflow-hidden bg-surface-card">
        <StationListTable<ReceivingLineRow>
          hideHeader={mode !== 'history'}
          loading={isLoading && rows.length === 0}
          isRefreshing={false}
          totalCount={rows.length}
          daySections={daySections}
          renderRow={renderRow}
          getRowKey={(row) => String(row.id)}
          virtualized={STATION_VIRTUAL_LIST}
          weekRange={mode === 'history' ? weekRange : undefined}
          weekOffset={weekOffset}
          onPrevWeek={() => setWeekOffset(weekOffset + 1)}
          onNextWeek={() => setWeekOffset(Math.max(0, weekOffset - 1))}
          onResetWeek={() => setWeekOffset(0)}
          showWeekControls={mode === 'history'}
          headerColumnsSlot={localHeaderColumns}
          headerEndSlot={localHeaderOptions}
          emptyMessage={emptyMessage}
          selectMode={selectMode}
          showStationColumnHeader
          columnHeaderStageLabel={mode === 'history' ? 'Tested' : 'Stage'}
        />
      </div>
    );
  } else {
    const scopeLabel = mode === 'returns' ? 'Return queue' : 'Pending tests';
    const queueBody =
      isLoading && rows.length === 0 ? (
        <div className="p-3">
          <SkeletonList count={12} type="row" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm font-semibold text-text-soft">{emptyMessage}</p>
        </div>
      ) : (
        <div className="flex w-full flex-col">
          {rows.map((row, index) => renderRow(row, index))}
        </div>
      );

    content = (
      <QueueTableShell
        toolbar={
          <QueueTableToolbar
            left={
              <DateRangePickerPill label={scopeLabel} count={rows.length} />
            }
          />
        }
        columnHeader={
          isMobile ? null : (
            <StationRowColumnHeader selectMode={selectMode} stageLabel="Stage" />
          )
        }
      >
        {queueBody}
      </QueueTableShell>
    );
  }

  const portaledQueueControls =
    mode !== 'history' && toolbarPortalTarget
      ? createPortal(<ColumnConfigButton variant="toolbar" />, toolbarPortalTarget)
      : null;

  return (
    <TableColumnConfigProvider tableId="testing">
      <TableDensityProvider tableId={mode === 'history' ? 'testing-history' : 'testing-queue'}>
        {mode === 'history' ? portaledControls : portaledQueueControls}
        {content}
      </TableDensityProvider>
    </TableColumnConfigProvider>
  );
}
