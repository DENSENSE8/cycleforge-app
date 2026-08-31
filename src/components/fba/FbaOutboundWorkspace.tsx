'use client';

/**
 * FBA inbound workbench — composed under `/shipping/fba`.
 *
 * The board / shipped table displays were torn out 2026-08-30 so the desk
 * can be rebuilt without hanging the dev server. Ready still mounts its own
 * body (a different family). Combine, detail, and the add/plan modals stay.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from '@/design-system/motion';
import { FbaQuickAddFnskuModal } from '@/components/fba/FbaQuickAddFnskuModal';
import { FbaCreatePlanModal } from '@/components/fba/FbaCreatePlanModal';
import { FbaBoardDetailPanel } from '@/components/fba/FbaBoardDetailPanel';
import { FbaErrorState } from '@/components/fba/FbaStateShells';
import { FbaCombineWorkspace } from '@/components/fba/sidebar/FbaCombineWorkspace';
import { ReadyWorkspaceBody } from '@/components/outbound/ready/ReadyWorkspaceBody';
import { Button, SlicedActionDock } from '@/design-system/primitives';
import { Package, X } from '@/components/Icons';
import { framerPresence, framerTransition, motionBezier } from '@/design-system/foundations/motion-framer';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { zIndex } from '@/design-system/tokens/z-index';
import { stationThemeColors } from '@/utils/staff-colors';
import { useStationTheme } from '@/hooks/useStationTheme';
import { useAuth } from '@/contexts/AuthContext';
import { useFbaRealtimeInvalidation } from '@/hooks/useFbaRealtimeInvalidation';
import { resolveFbaModeFromSearchParams, type FbaMode } from '@/lib/fba/fba-modes';
import { FBA_BOARD_TOGGLE_ALL } from '@/lib/fba/events';
import { useSearchParams } from 'next/navigation';
import { useFbaBoard } from '@/app/fba/useFbaBoard';
import { useFbaWeekFilter } from '@/app/fba/useFbaWeekFilter';
import { useFbaCombine } from '@/app/fba/useFbaCombine';
import { useFbaDetailPanel } from '@/app/fba/useFbaDetailPanel';
import { useFbaWorkspaceUrlState } from '@/components/fba/sidebar/fba-workspace-hooks';
import { cn } from '@/utils/_cn';

/**
 * The desk MODES, as filter-option vocabulary (`mode:*` ids so Ready's
 * merged menu can route them). `combine` is what an unset `?fbaMode=`
 * resolves to, so it IS the default body and never appears as an option —
 * "all" is the absence of a filter.
 */
const FBA_MODE_OPTIONS = [
  { id: 'mode:ready', mode: 'ready', label: 'Ready' },
  { id: 'mode:plan', mode: 'plan', label: 'Plan' },
  { id: 'mode:shipped', mode: 'shipped', label: 'Shipped' },
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
  const { board, error, fetchBoard } = useFbaBoard();
  const weekFilter = useFbaWeekFilter(board.pending, activeMode);
  const combine = useFbaCombine(activeMode);
  const { detailItem, setDetailItem, handleDetailNavigate } = useFbaDetailPanel(
    weekFilter.filteredPendingItems,
  );

  const handleSelectTab = useCallback(
    (tab: FbaMode) => {
      updateFbaParams({ mode: tab, q: '' });
    },
    [updateFbaParams],
  );

  const modeFilter = useMemo(
    () => ({
      // Banded, because these three are not peers of the status facets they
      // merge with: a status narrows the rows in front of you, a mode swaps
      // which collection you are looking at. Rendered as one flat column the
      // operator could only learn that by picking one and watching the board
      // change underneath them.
      options: FBA_MODE_OPTIONS.map((o) => ({
        id: o.id,
        group: 'Board',
        label: o.label,
        active: activeMode === o.mode,
      })),
      onToggle: (id: string) => {
        const picked = FBA_MODE_OPTIONS.find((o) => o.id === id)?.mode;
        if (!picked) return;
        handleSelectTab(picked === activeMode ? 'combine' : (picked as FbaMode));
      },
      onClear: () => {
        if (activeMode !== 'combine') handleSelectTab('combine');
      },
    }),
    [activeMode, handleSelectTab],
  );
  const modeFilterBag = useMemo(
    () => ({
      options: modeFilter.options,
      onToggle: modeFilter.onToggle,
      onClearAll: modeFilter.onClear,
    }),
    [modeFilter],
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
    ...useMotionPresence(framerPresence.workbenchPaneSettle),
    transition: useMotionTransition(framerTransition.workbenchPaneSettle),
  };

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col">
      {!isReady ? (
        <div className="flex min-w-0 shrink-0 items-center gap-1 border-b border-border-soft bg-surface-card px-2 py-1">
          {FBA_MODE_OPTIONS.map((o) => (
            <Button
              key={o.id}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleSelectTab(o.mode === activeMode ? 'combine' : o.mode)}
              className={cn(
                activeMode === o.mode ? 'font-medium text-text-primary' : 'text-text-muted',
              )}
            >
              {o.label}
            </Button>
          ))}
        </div>
      ) : null}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeMode}
          {...paneMotionProps}
          className="relative flex min-h-0 min-w-0 flex-1 flex-col"
        >
          {isReady ? (
            <ReadyWorkspaceBody modeFilter={modeFilterBag} />
          ) : error ? (
            <FbaErrorState message={error} onRetry={fetchBoard} theme={stationTheme} />
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
