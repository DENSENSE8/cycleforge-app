'use client';

/**
 * FBA prep station workspace — composed under `/outbound?mode=fba`.
 * Logic lives in focused hooks under `src/app/fba/*` (board, week, combine, detail).
 */

import { useEffect, useRef } from 'react';
import { AnimatePresence, useReducedMotion } from 'framer-motion';
import { FbaQuickAddFnskuModal } from '@/components/fba/FbaQuickAddFnskuModal';
import { FbaCreatePlanModal } from '@/components/fba/FbaCreatePlanModal';
import { FbaBoardDetailPanel } from '@/components/fba/FbaBoardDetailPanel';
import { FbaBoardRegion } from '@/components/fba/FbaBoardRegion';
import StationFba from '@/components/station/StationFba';
import { useStationTheme } from '@/hooks/useStationTheme';
import { useAuth } from '@/contexts/AuthContext';
import { useFbaRealtimeInvalidation } from '@/hooks/useFbaRealtimeInvalidation';
import { resolveFbaModeFromSearchParams } from '@/lib/fba/fba-modes';
import { useSearchParams } from 'next/navigation';
import { useFbaBoard } from '@/app/fba/useFbaBoard';
import { useFbaWeekFilter } from '@/app/fba/useFbaWeekFilter';
import { useFbaCombine } from '@/app/fba/useFbaCombine';
import { useFbaDetailPanel } from '@/app/fba/useFbaDetailPanel';

export function FbaOutboundWorkspace() {
  const searchParams = useSearchParams();
  useFbaRealtimeInvalidation();

  const activeMode = resolveFbaModeFromSearchParams(searchParams);
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

  return (
    <div className="flex h-full w-full min-w-0 flex-1 flex-col bg-surface-canvas">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-l border-border-soft/80 bg-surface-card">
        <StationFba embedded>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-card">
              <FbaBoardRegion
                error={error}
                onRetry={fetchBoard}
                activeMode={activeMode}
                stationTheme={stationTheme}
                prefersReducedMotion={prefersReducedMotion}
                loading={loading}
                hasBoardItems={board.pending.length > 0}
                weekFilter={weekFilter}
                combine={combine}
                onDetailOpen={setDetailItem}
              />
            </div>
          </div>
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
        </StationFba>
      </div>
    </div>
  );
}
