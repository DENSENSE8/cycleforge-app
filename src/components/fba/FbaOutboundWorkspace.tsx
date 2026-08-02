'use client';

/**
 * FBA prep workspace — composed under `/shipping?mode=fba` on the Axis-5
 * two-zone workbench shell: pinned `FbaWorkspaceHeader` chrome (Plan · Combine ·
 * Shipped facet tabs + search + week/select controls) over one scroll body of
 * `FbaKpiStrip` (scrolls away) + the full-bleed board / shipped table. Sub-mode
 * bodies crossfade (`workbenchPaneSettle`); the combine workspace overlays the
 * whole pane; logic lives in focused hooks under `src/app/fba/*`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from '@/design-system/motion';
import { FbaQuickAddFnskuModal } from '@/components/fba/FbaQuickAddFnskuModal';
import { FbaCreatePlanModal } from '@/components/fba/FbaCreatePlanModal';
import { FbaBoardDetailPanel } from '@/components/fba/FbaBoardDetailPanel';
import { FbaBoardTable } from '@/components/fba/FbaBoardTable';
import { FbaShippedTable } from '@/components/fba/FbaShippedTable';
import { FbaErrorState } from '@/components/fba/FbaStateShells';
import { FbaCombineWorkspace } from '@/components/fba/sidebar/FbaCombineWorkspace';
import { FbaWorkspaceHeader } from '@/components/fba/FbaWorkspaceHeader';
import { FbaKpiStrip } from '@/components/fba/FbaKpiStrip';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import {
  WORKBENCH_BODY_COLUMN,
  WORKBENCH_CHROME_COLUMN,
} from '@/components/dashboard/workbench-shell';
import { SlicedActionDock } from '@/design-system/primitives';
import { Package, X } from '@/components/Icons';
import { framerPresence, framerTransition, motionBezier } from '@/design-system/foundations/motion-framer';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { zIndex } from '@/design-system/tokens/z-index';
import { stationThemeColors } from '@/utils/staff-colors';
import { useStationTheme } from '@/hooks/useStationTheme';
import { useAuth } from '@/contexts/AuthContext';
import { useFbaRealtimeInvalidation } from '@/hooks/useFbaRealtimeInvalidation';
import { resolveFbaModeFromSearchParams, type FbaMode } from '@/lib/fba/fba-modes';
import {
  computeFbaBoardStageCounts,
  type FbaBoardStatusFilter,
} from '@/lib/fba/fba-metrics';
import { FBA_BOARD_TOGGLE_ALL } from '@/lib/fba/events';
import { useSearchParams } from 'next/navigation';
import { useFbaBoard } from '@/app/fba/useFbaBoard';
import { useFbaWeekFilter } from '@/app/fba/useFbaWeekFilter';
import { useFbaCombine } from '@/app/fba/useFbaCombine';
import { useFbaDetailPanel } from '@/app/fba/useFbaDetailPanel';
import { useFbaWorkspaceUrlState } from '@/components/fba/sidebar/fba-workspace-hooks';

export function FbaOutboundWorkspace() {
  const searchParams = useSearchParams();
  useFbaRealtimeInvalidation();

  const activeMode = resolveFbaModeFromSearchParams(searchParams);
  const { updateFbaParams } = useFbaWorkspaceUrlState();
  const { user } = useAuth();
  const staffId = user?.staffId ?? 0;
  const { theme: stationTheme } = useStationTheme({ staffId });
  const prefersReducedMotion = useReducedMotion();

  const { board, loading, error, fetchBoard } = useFbaBoard();
  const weekFilter = useFbaWeekFilter(board.pending, activeMode);
  const combine = useFbaCombine(activeMode);
  const { detailItem, setDetailItem, handleDetailNavigate } = useFbaDetailPanel(
    weekFilter.filteredPendingItems,
  );

  // Facet filter + search are mode-scoped view state (cleared on tab change);
  // the KPI strip, chrome search, and table all read the same pair.
  const [statusFilter, setStatusFilter] = useState<FbaBoardStatusFilter>('ALL');
  const [search, setSearch] = useState('');

  const handleSelectTab = useCallback(
    (tab: FbaMode) => {
      setStatusFilter('ALL');
      setSearch('');
      updateFbaParams({ mode: tab });
    },
    [updateFbaParams],
  );

  const handleToggleFilter = useCallback((filter: FbaBoardStatusFilter) => {
    setStatusFilter((prev) => (filter === 'ALL' || prev === filter ? 'ALL' : filter));
  }, []);

  const handleResetFilters = useCallback(() => {
    setStatusFilter('ALL');
    setSearch('');
  }, []);

  const stageCounts = useMemo(
    () => computeFbaBoardStageCounts(weekFilter.filteredPendingItems),
    [weekFilter.filteredPendingItems],
  );

  const detailIdx = detailItem
    ? weekFilter.filteredPendingItems.findIndex((i) => i.fnsku === detailItem.fnsku)
    : -1;

  // Deep-link: openShipmentId=<fba_shipments.id> on outbound FBA mode.
  const openedShipmentRef = useRef<string | null>(null);
  useEffect(() => {
    const target = searchParams.get('openShipmentId');
    if (!target || !/^\d+$/.test(target)) return;
    if (openedShipmentRef.current === target) return;
    const shipmentId = Number(target);
    const match = board.pending.find((it) => it.shipment_id === shipmentId);
    if (match) {
      openedShipmentRef.current = target;
      setDetailItem(match);
    }
  }, [searchParams, board.pending, setDetailItem]);

  const isBoard = activeMode === 'plan' || activeMode === 'combine';
  const { weekRange, weekOffset, setWeekOffset, filteredPendingItems, boardEmptyMessage } =
    weekFilter;
  const { boardSelection, selectedUnits, workspaceActive, showCombineBar, handleStartCombine } =
    combine;
  const theme = stationThemeColors[stationTheme];

  const paneMotionProps = {
    ...useMotionPresence(framerPresence.workbenchPaneSettle),
    transition: useMotionTransition(framerTransition.workbenchPaneSettle),
  };

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col">
      <DashboardScrollShell
        className="h-full bg-surface-canvas"
        chrome={
          <div className={WORKBENCH_CHROME_COLUMN}>
            <FbaWorkspaceHeader
              tab={activeMode}
              onSelectTab={handleSelectTab}
              search={search}
              onSearchChange={setSearch}
              weekRange={isBoard ? weekRange : undefined}
              weekOffset={weekOffset}
              onPrevWeek={isBoard ? () => setWeekOffset((o) => o - 1) : undefined}
              onNextWeek={isBoard ? () => setWeekOffset((o) => Math.min(0, o + 1)) : undefined}
              visibleCount={filteredPendingItems.length}
            />
          </div>
        }
      >
        <div className={WORKBENCH_BODY_COLUMN}>
          {isBoard ? (
            <div className="mb-4">
              <FbaKpiStrip
                counts={stageCounts}
                activeFilter={statusFilter}
                onToggleFilter={handleToggleFilter}
              />
            </div>
          ) : null}

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeMode}
              {...paneMotionProps}
              className="relative flex min-w-0 flex-col"
            >
              {error ? (
                <FbaErrorState message={error} onRetry={fetchBoard} theme={stationTheme} />
              ) : activeMode === 'shipped' ? (
                <FbaShippedTable
                  stationTheme={stationTheme}
                  searchQuery={search}
                  embedded={false}
                />
              ) : (
                <FbaBoardTable
                  items={filteredPendingItems}
                  loading={loading && board.pending.length === 0}
                  stationTheme={stationTheme}
                  emptyMessage={boardEmptyMessage}
                  onDetailOpen={setDetailItem}
                  statusFilter={statusFilter}
                  query={search}
                  onResetFilters={handleResetFilters}
                  // Reserve space so the last rows clear the floating combine pill.
                  contentClassName={showCombineBar ? 'pb-28' : undefined}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </DashboardScrollShell>

      {/* Bottom-edge sliced dock (same family as station terminal) —
          pinned to the pane, not the scroll content. */}
      {showCombineBar ? (
        <SlicedActionDock
          edge="bottom"
          label={`Combine ${boardSelection.length} item${boardSelection.length === 1 ? '' : 's'} · ${selectedUnits} unit${selectedUnits === 1 ? '' : 's'}`}
          onClick={handleStartCombine}
          icon={<Package className="h-4 w-4 shrink-0" />}
          tone="violet"
          toneClasses={{ bg: theme.bg, hover: theme.hover }}
          maxWidth="max-w-[720px]"
          menuLabel="Selection actions"
          menuTitle="Clear or adjust selection"
          menu={[
            {
              label: 'Clear selection',
              icon: <X className="h-3.5 w-3.5 shrink-0" />,
              onClick: () =>
                window.dispatchEvent(new CustomEvent(FBA_BOARD_TOGGLE_ALL, { detail: 'none' })),
            },
          ]}
        />
      ) : null}

      {/* Combine workspace — a takeover over the whole pane (chrome included),
          fading on `workspaceActive` exactly as before the shell refactor. */}
      {activeMode === 'combine' && (
        <motion.div
          className="absolute inset-0 bg-surface-card"
          style={{ zIndex: zIndex.panel, pointerEvents: workspaceActive ? 'auto' : 'none' }}
          initial={false}
          animate={
            prefersReducedMotion
              ? { opacity: workspaceActive ? 1 : 0 }
              : { opacity: workspaceActive ? 1 : 0, y: workspaceActive ? 0 : 6 }
          }
          transition={{ duration: 0.18, ease: motionBezier.easeOut }}
          aria-hidden={!workspaceActive}
        >
          <FbaCombineWorkspace
            selectedItems={boardSelection}
            stationTheme={stationTheme}
            onClose={() => combine.setCombineOpen(false)}
          />
        </motion.div>
      )}

      <FbaQuickAddFnskuModal stationTheme={stationTheme} />
      <FbaCreatePlanModal stationTheme={stationTheme} />

      <AnimatePresence>
        {detailItem && (
          <FbaBoardDetailPanel
            key="fba-detail-panel"
            item={detailItem}
            onClose={() => setDetailItem(null)}
            onNavigate={handleDetailNavigate}
            onSaved={fetchBoard}
            disableMoveUp={detailIdx <= 0}
            disableMoveDown={detailIdx >= weekFilter.filteredPendingItems.length - 1}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
