'use client';

/**
 * FBA inbound workbench — composed under `/shipping/fba` on the Axis-5
 * two-zone workbench shell: pinned `FbaWorkspaceHeader` chrome (Ready · Plan ·
 * Combine · Shipped facet tabs + search + week/select controls) over one
 * scroll body. Ready hosts channel-allocation history; plan/combine hosts the
 * FNSKU board; shipped hosts history. Sub-mode bodies crossfade
 * (`workbenchPaneSettle`); the combine workspace overlays the whole pane;
 * logic lives in focused hooks under `src/app/fba/*`.
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
import { ReadyWorkspaceBody } from '@/components/outbound/ready/ReadyWorkspaceBody';
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
import { TableTabs } from '@/components/tables/TableStatusBar';
import { SearchField } from '@/design-system/primitives/SearchField';

/**
 * The desk strip. `combine` is what an unset `?mode=` resolves to, so it IS the
 * default body and lights no tab — the same rule every other strip follows.
 */
const FBA_MODE_TABS = [
  { id: 'ready', label: 'Ready' },
  { id: 'plan', label: 'Plan' },
  { id: 'shipped', label: 'Shipped' },
] as const;

export function FbaOutboundWorkspace() {
  const searchParams = useSearchParams();
  useFbaRealtimeInvalidation();

  const activeMode = resolveFbaModeFromSearchParams(searchParams);
  const { updateFbaParams } = useFbaWorkspaceUrlState();
  const { user } = useAuth();
  const staffId = user?.staffId ?? 0;
  const { theme: stationTheme } = useStationTheme({ staffId });
  const prefersReducedMotion = useReducedMotion();

  const isReady = activeMode === 'ready';
  const { board, loading, error, fetchBoard } = useFbaBoard();
  const weekFilter = useFbaWeekFilter(board.pending, activeMode);
  const combine = useFbaCombine(activeMode);
  const { detailItem, setDetailItem, handleDetailNavigate } = useFbaDetailPanel(
    weekFilter.filteredPendingItems,
  );

  // Facet filter + search are mode-scoped view state (cleared on tab change);
  // the KPI strip, chrome search, and table all read the same pair.
  // Ready uses URL `?q=` so disposition deep-links stay bookmarkable.
  const [statusFilter, setStatusFilter] = useState<FbaBoardStatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const readySearch = String(searchParams.get('q') || '');
  // Portal target for the Ready grid's column-display (▦) trigger — seats it in
  // the triage band controls slot instead of the sheet card corner.
  // Band 2 here is a raw strip, not a snap-collapsible KPI band, so there is no
  // per-staff collapse preference to read — see the `band2` slot below.

  const handleSelectTab = useCallback(
    (tab: FbaMode) => {
      setStatusFilter('ALL');
      setSearch('');
      updateFbaParams({ mode: tab, q: '' });
    },
    [updateFbaParams],
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      if (isReady) {
        updateFbaParams({ q: value });
        return;
      }
      setSearch(value);
    },
    [isReady, updateFbaParams],
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

  const { filteredPendingItems, boardEmptyMessage } =
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
      {/* The find field sits with the rows it narrows, not on a chrome band. */}
      <div className="flex min-w-0 shrink-0 items-center gap-2 border-b border-border-soft bg-surface-card px-2 py-1">
        <SearchField
          value={isReady ? readySearch : search}
          onChange={handleSearchChange}
          placeholder="Filter shipments…"
          className="min-w-0 max-w-[22rem] flex-1"
          tone="neutral"
          hideUnderline
        />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeMode}
          {...paneMotionProps}
          className="relative flex min-w-0 flex-col"
        >
          {isReady ? (
            <ReadyWorkspaceBody />
          ) : error ? (
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
      {/* The desk switches BODY on a tab; each body foots its own strip. */}
      <TableTabs
        tabs={FBA_MODE_TABS}
        activeTab={activeMode === 'combine' ? undefined : activeMode}
        onTabChange={(id) => handleSelectTab(id === activeMode ? 'combine' : (id as FbaMode))}
        className="border-t border-border-soft bg-surface-card"
      />

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

      {!isReady ? (
        <>
          <FbaQuickAddFnskuModal stationTheme={stationTheme} />
          <FbaCreatePlanModal stationTheme={stationTheme} />
        </>
      ) : null}

      <AnimatePresence>
        {detailItem && !isReady ? (
          <FbaBoardDetailPanel
            key="fba-detail-panel"
            item={detailItem}
            onClose={() => setDetailItem(null)}
            onNavigate={handleDetailNavigate}
            onSaved={fetchBoard}
            disableMoveUp={detailIdx <= 0}
            disableMoveDown={detailIdx >= weekFilter.filteredPendingItems.length - 1}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
