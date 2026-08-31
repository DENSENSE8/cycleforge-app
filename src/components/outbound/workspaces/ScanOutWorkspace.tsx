'use client';

/**
 * `/shipping/scan-out` — the dock ship-confirm surface.
 *
 * Idle = scan-await. A gun confirm (or rail select) opens the Pack-family
 * carton workbench + Displays. The scan bar lives in the sidebar
 * (`ScanOutModeBody`); recent ship-outs are the left rail.
 *
 * Wears {@link DeskPageLayout} like every other station (operator 2026-08-31) —
 * single lane, no tabs.
 */

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AnimatePresence,
  motion,
  motionRole,
  useMotionRole,
  useOverlaySwapHardCut,
} from '@/design-system/motion';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { ScanOutIdleAwait } from '@/components/outbound/scan-out/ScanOutIdleAwait';
import { ScanOutActivePanel } from '@/components/outbound/scan-out/ScanOutActivePanel';
import { useScanOutActivePane } from '@/components/outbound/scan-out/useScanOutStation';
import { dispatchScanOutActive } from '@/components/outbound/scan-out/scan-out-active';
import { bustScanOutCaches } from '@/lib/outbound/outbound-cache-keys';
import { zIndex } from '@/design-system/tokens/z-index';
import { appSurfaceFillClass } from '@/design-system/components/AppSurfaceFill';
import { cn } from '@/utils/_cn';

export function ScanOutWorkspace() {
  const activePane = useScanOutActivePane();
  const queryClient = useQueryClient();
  const [isUndoing, setIsUndoing] = useState(false);

  const { presence: panePresence, transition: paneTransition } = useMotionRole(
    motionRole.swap.scan,
  );
  const showOverlay = activePane != null && activePane.status !== 'miss';
  const entitySwapHardCut = useOverlaySwapHardCut(showOverlay);

  const overlayKey = activePane
    ? activePane.scanDriven
      ? `scan-${activePane.shipmentId ?? activePane.tracking}`
      : `row-${activePane.orderRowId ?? activePane.tracking}`
    : 'none';

  const handleUndo = useCallback(() => {
    const shipmentId = activePane?.shipmentId;
    if (!shipmentId || isUndoing) return;
    setIsUndoing(true);
    void fetch('/api/shipped/scan-out', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipmentId }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`undo failed (${res.status})`);
        dispatchScanOutActive(null);
        bustScanOutCaches(queryClient);
      })
      .finally(() => setIsUndoing(false));
  }, [activePane?.shipmentId, isUndoing, queryClient]);

  return (
    <DeskPageLayout className="h-full">
      <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <div
          className={cn(
            'flex h-full min-h-0 w-full flex-col',
            showOverlay ? 'pointer-events-none' : '',
          )}
          aria-hidden={showOverlay ? true : undefined}
          inert={showOverlay ? true : undefined}
          style={{ visibility: showOverlay ? 'hidden' : 'visible' }}
        >
          <ScanOutIdleAwait />
        </div>

        <AnimatePresence initial={false} mode={entitySwapHardCut ? 'sync' : 'wait'}>
          {showOverlay && activePane ? (
            <motion.div
              key={overlayKey}
              initial={entitySwapHardCut ? false : panePresence.initial}
              animate={panePresence.animate}
              exit={panePresence.exit}
              transition={paneTransition}
              style={{ zIndex: zIndex.panel + (entitySwapHardCut ? 1 : 0) }}
              className={cn(
                'absolute inset-0 flex min-h-0 flex-col',
                appSurfaceFillClass('canvas'),
              )}
            >
              <ScanOutActivePanel
                pane={activePane}
                onUndo={handleUndo}
                canUndo={activePane.status === 'ok' && Boolean(activePane.shipmentId)}
                isUndoing={isUndoing}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </DeskPageLayout>
  );
}
