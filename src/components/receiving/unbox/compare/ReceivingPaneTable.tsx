'use client';

/**
 * One compare pane — prop-driven receiving query + local selection/sort.
 * Shares `tableId: 'receiving'` column prefs with siblings (paint once).
 * Linked crosshair (carton `receiving_id`) is host-owned; this pane only
 * reports hover/select and paints peer matches.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import { computeWeekRange } from '@/utils/date';
import { useReceivingLinesData } from '@/components/station/useReceivingLinesData';
import { useReceivingGrouping } from '@/components/station/useReceivingGrouping';
import { ReceivingGridHost } from '@/components/station/receiving-grid/ReceivingGridHost';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { dispatchSelectLine } from '@/components/station/receiving-lines-table-helpers';
import {
  buildReceivingPaneModeState,
  receivingPaneQueryKey,
  type ReceivingPaneQuery,
} from '@/lib/receiving/receiving-pane-query';
import {
  normalizeCartonReceivingId,
  scrollPaneToReceivingId,
} from '@/lib/receiving/unbox-compare-crosshair';
import {
  UNBOX_WORKSPACE_TAB_LABEL,
  type UnboxWorkspaceTab,
} from '@/utils/unbox-workspace-state';
import {
  defaultDirForReceivingGridSort,
  type ReceivingGridColumnKey,
} from '@/lib/receiving/receiving-grid-layout';
import { cn } from '@/utils/_cn';

const QUEUE_LANES = [
  { id: 'PO_STOCKOUT', label: 'Stockout' },
  { id: 'PO_STANDARD', label: 'Standard' },
  { id: 'RETURN', label: 'Return' },
  { id: 'HOLD', label: 'Hold' },
] as const;

export function ReceivingPaneTable({
  paneId,
  query,
  onQueryChange,
  active,
  onActivate,
  selectMode,
  selectionScope,
  linkedReceivingId = null,
  stickyReceivingId = null,
  onCrosshairHover,
  onCrosshairSelect,
  className,
}: {
  paneId: string;
  query: ReceivingPaneQuery;
  onQueryChange: (next: ReceivingPaneQuery) => void;
  active: boolean;
  onActivate: () => void;
  selectMode: boolean;
  selectionScope: string;
  /** Resolved crosshair carton (hover ?? sticky) for peer row wash. */
  linkedReceivingId?: number | null;
  /** Sticky carton from select — drives peer scroll-into-view only. */
  stickyReceivingId?: number | null;
  onCrosshairHover?: (receivingId: number | null) => void;
  onCrosshairSelect?: (receivingId: number | null) => void;
  className?: string;
}) {
  const { isMobile } = useUIModeOptional();
  const [weekOffset, setWeekOffset] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const paneRootRef = useRef<HTMLDivElement>(null);
  const weekRange = computeWeekRange(weekOffset);

  const paneKey = receivingPaneQueryKey(query);
  const modeState = useMemo(
    () => buildReceivingPaneModeState(query),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content
    [paneKey],
  );

  const { isLoading, localRows } = useReceivingLinesData({
    mode: modeState.mode,
    modeContext: modeState.modeContext,
    isIncomingMode: false,
    isDeliveredUnscannedFacet: false,
    isDeliveredNotUnboxedFacet: false,
    incomingPage: 1,
    setWeekOffset,
    scrollRef,
  });

  const { filteredGroupedRecords } = useReceivingGrouping({
    localRows,
    mode: modeState.mode,
    historyAxis: modeState.historyAxis,
    weekRange,
    skipWeekFilter: modeState.skipWeekFilter,
  });

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [sort, setSort] = useState<ReceivingGridColumnKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null);

  const handleSelectRow = useCallback(
    (row: ReceivingLineRow) => {
      onActivate();
      setSelectedId(row.id);
      dispatchSelectLine(row);
      onCrosshairSelect?.(normalizeCartonReceivingId(row.receiving_id));
    },
    [onActivate, onCrosshairSelect],
  );

  const handleToggleRow = useCallback(
    (row: ReceivingLineRow) => {
      onActivate();
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(row.id)) next.delete(row.id);
        else next.add(row.id);
        return next;
      });
    },
    [onActivate],
  );

  // Sticky select → scroll first matching peer row into view (not on hover).
  useEffect(() => {
    if (stickyReceivingId == null) return;
    const openRow = localRows.find((r) => r.id === selectedId);
    if (normalizeCartonReceivingId(openRow?.receiving_id) === stickyReceivingId) {
      return;
    }
    // Defer one frame so virtualized rows for the new sticky id can mount.
    const raf = requestAnimationFrame(() => {
      scrollPaneToReceivingId(paneRootRef.current, stickyReceivingId);
    });
    return () => cancelAnimationFrame(raf);
  }, [stickyReceivingId, localRows, selectedId]);

  const setTab = (tab: UnboxWorkspaceTab) => {
    onQueryChange({
      ...query,
      tab,
      queueStage: tab === 'queue' ? query.queueStage : null,
      queueLane: tab === 'queue' ? query.queueLane : null,
    });
  };

  return (
    <div
      ref={paneRootRef}
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col border border-border-soft bg-surface-card',
        active && 'ring-2 ring-accent-bg/40',
        className,
      )}
      data-unbox-compare-pane={paneId}
      data-active={active || undefined}
      onPointerDown={onActivate}
    >
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border-soft px-2">
        {(['queue', 'recent', 'history'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={cn(
              'ds-raw-button rounded-md px-2 py-1 text-role-caption font-semibold',
              query.tab === tab
                ? 'bg-surface-sunken text-text-default'
                : 'text-text-muted hover:text-text-default',
            )}
            onClick={() => setTab(tab)}
          >
            {UNBOX_WORKSPACE_TAB_LABEL[tab]}
          </button>
        ))}
        {query.tab === 'queue' ? (
          <select
            className="ml-auto max-w-[8rem] truncate rounded-md border border-border-soft bg-surface-card px-1.5 py-0.5 text-role-caption"
            value={query.queueLane ?? ''}
            aria-label="Pane lane filter"
            onChange={(e) => {
              const v = e.target.value;
              onQueryChange({
                ...query,
                queueLane: (QUEUE_LANES.some((l) => l.id === v)
                  ? v
                  : null) as ReceivingPaneQuery['queueLane'],
              });
            }}
          >
            <option value="">All lanes</option>
            {QUEUE_LANES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="ml-auto text-role-micro text-text-faint">
            {localRows.length} rows
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1">
        <ReceivingGridHost
          filteredGroupedRecords={filteredGroupedRecords}
          loading={isLoading}
          emptyMessage="No rows in this pane"
          isMobile={isMobile}
          selectMode={selectMode}
          selectedId={selectedId}
          selectedIds={selectedIds}
          handleSelectRow={handleSelectRow}
          handleToggleRow={handleToggleRow}
          activityAxis={modeState.historyAxis}
          isHistory={modeState.isHistoryMode}
          statusVocabulary={modeState.isHistoryMode ? 'coarse' : 'fine'}
          selectionScope={selectionScope}
          tableId="receiving"
          enableColumnMenu
          linkedReceivingId={linkedReceivingId}
          onCrosshairHover={onCrosshairHover}
          controlledSort={sort}
          controlledSortDir={sortDir}
          onControlledSortChange={(key, dir) => {
            setSort(key);
            setSortDir(dir ?? defaultDirForReceivingGridSort(key));
          }}
          onControlledSortClear={() => {
            setSort(null);
            setSortDir(null);
          }}
          scrollRef={scrollRef}
          testId={`receiving-compare-pane-${paneId}`}
        />
      </div>
    </div>
  );
}
