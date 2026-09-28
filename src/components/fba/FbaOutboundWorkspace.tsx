'use client';

/** FBA inbound workbench — composed under `/shipping/fba`. */

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from '@/design-system/motion';
import { FbaQuickAddFnskuModal } from '@/components/fba/FbaQuickAddFnskuModal';
import { FbaCreatePlanModal } from '@/components/fba/FbaCreatePlanModal';
import { FbaBoardDetailPanel } from '@/components/fba/FbaBoardDetailPanel';
import { FbaErrorState } from '@/components/fba/FbaStateShells';
import { FbaCombineWorkspace } from '@/components/fba/sidebar/FbaCombineWorkspace';
import { FbaActiveShipments } from '@/components/fba/sidebar/FbaActiveShipments';
import { FbaCombineRailBody, FbaPlanRailBody } from '@/components/fba/sidebar/FbaSidebarRails';
import { ReadyWorkspaceBody } from '@/components/outbound/ready/ReadyWorkspaceBody';
import { SlicedActionDock } from '@/design-system/primitives';
import { Package, X } from '@/components/Icons';
import { motionPresence, motionTransition, motionBezier } from '@/design-system/foundations/motion-presets';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { zIndex } from '@/design-system/tokens/z-index';
import { stationThemeColors } from '@/utils/staff-colors';
import { useStationTheme } from '@/hooks/useStationTheme';
import { useAuth } from '@/contexts/AuthContext';
import { useFbaRealtimeInvalidation } from '@/hooks/useFbaRealtimeInvalidation';
import { resolveFbaModeFromSearchParams } from '@/lib/fba/fba-modes';
import { FBA_BOARD_TOGGLE_ALL } from '@/lib/fba/events';
import { useSearchParams } from 'next/navigation';
import { useFbaBoard } from '@/app/fba/useFbaBoard';
import { useFbaWeekFilter } from '@/app/fba/useFbaWeekFilter';
import { useFbaCombine } from '@/app/fba/useFbaCombine';
import { useFbaDetailPanel } from '@/app/fba/useFbaDetailPanel';
import { FBAManagementTab } from '@/components/admin/FBAManagementTab';

/**
 * The FBA modes (Ready · Plan · Combine · Shipped · Catalog) are the page's
 * views: the contextual sidebar paints them from `SIDEBAR_PAGE_NAV.fba` and
 * writes `?fbaMode=`; this body only reads it.
 */
export function FbaOutboundWorkspace() {
  const searchParams = useSearchParams();
  useFbaRealtimeInvalidation();

  const activeMode = resolveFbaModeFromSearchParams(searchParams);
  const { user } = useAuth();
  const staffId = user?.staffId ?? 0;
  const { theme: stationTheme } = useStationTheme({ staffId });
  const prefersReducedMotion = useReducedMotion();

  const isReady = activeMode === 'ready';
  const { board, error, fetchBoard } = useFbaBoard();
  const weekFilter = useFbaWeekFilter(board.pending, activeMode);
  const combine = useFbaCombine(activeMode);
  const { detailItem, setDetailItem, handleDetailNavigate } = useFbaDetailPanel(
    weekFilter.filteredPendingItems,
  );

  const detailIdx = detailItem
    ? weekFilter.filteredPendingItems.findIndex((i) => i.fnsku === detailItem.fnsku)
    : -1;

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

  const { boardSelection, selectedUnits, workspaceActive, showCombineBar, handleStartCombine } =
    combine;
  const theme = stationThemeColors[stationTheme];

  const paneMotionProps = {
    ...useMotionPresence(motionPresence.workbenchPaneSettle),
    transition: useMotionTransition(motionTransition.workbenchPaneSettle),
  };

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeMode}
          {...paneMotionProps}
          className="relative flex min-h-0 min-w-0 flex-1 flex-col"
        >
          {isReady ? (
            <ReadyWorkspaceBody />
          ) : activeMode === 'catalog' ? (
            // Catalog owns its own data + sticky header; the board's
            // error/empty states do not apply to it.
            <FBAManagementTab searchTerm={searchParams.get('q') ?? ''} />
          ) : error ? (
            <FbaErrorState message={error} onRetry={fetchBoard} theme={stationTheme} />
          ) : activeMode === 'plan' ? (
            /* The former board table was removed with its unsafe table implementation. */
            <FbaPlanRailBody view="planned" />
          ) : activeMode === 'combine' ? (
            /* The combine queue is the same selected-shipment source used by
                the context rail. The overlay replaces this only once a user
                starts the typed combine flow. */
            <FbaCombineRailBody view="recent" stationTheme={stationTheme} />
          ) : activeMode === 'shipped' ? (
            /* Shipped history is a projection of the existing shipment
                controller and card face. It must not revive the retired table
                or create a route-local data model. */
            <FbaActiveShipments stationTheme={stationTheme} scope="shipped" />
          ) : (
            <div className="min-h-0 flex-1" />
          )}
        </motion.div>
      </AnimatePresence>

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
