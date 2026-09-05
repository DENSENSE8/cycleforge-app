'use client';

/**
 * `/shipping/scan-out` — floor scan station (Pack shell, Unbox composer).
 *
 * White work surface only (`bg-surface-card`) — no canvas gray. CartonContextCard
 * header with ◁ on focus. Floor mouth is {@link StationComposerHost} (same as
 * Unbox): mode faces off, below-outline row + bottom-right context ring on.
 */

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AnimatePresence,
  idleBrowseLayerProps,
  motion,
  motionRole,
  overlayPaneStyle,
  useMotionRole,
  useOverlaySwapHardCut,
} from '@/design-system/motion';
import { ScanOutIdleAwait } from '@/components/outbound/scan-out/ScanOutIdleAwait';
import { ScanOutActivePanel } from '@/components/outbound/scan-out/ScanOutActivePanel';
import { ScanOutComposerDock } from '@/components/outbound/scan-out/ScanOutComposerDock';
import { useScanOutActivePane } from '@/components/outbound/scan-out/useScanOutStation';
import { dispatchScanOutActive } from '@/components/outbound/scan-out/scan-out-active';
import { bustScanOutCaches } from '@/lib/outbound/outbound-cache-keys';
import { appWorkCanvasClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';

export function ScanOutWorkspace() {
  const activePane = useScanOutActivePane();
  const queryClient = useQueryClient();
  const [isUndoing, setIsUndoing] = useState(false);

  const { presence: panePresence, transition: paneTransition } = useMotionRole(
    motionRole.swap.scan,
  );
  const showFocused = activePane != null && activePane.status !== 'miss';
  const entitySwapHardCut = useOverlaySwapHardCut(showFocused);

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
    <div
      className={cn(appWorkCanvasClass, 'relative h-full bg-surface-card')}
      data-testid="scan-out-workspace"
    >
      <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-surface-card">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-card">
          <div
            {...idleBrowseLayerProps(
              showFocused,
              'flex h-full min-h-0 w-full flex-col bg-surface-card',
            )}
          >
            <ScanOutIdleAwait listenDisplays={!showFocused} />
          </div>

          <AnimatePresence initial={false} mode={entitySwapHardCut ? 'sync' : 'wait'}>
            {showFocused && activePane ? (
              <motion.div
                key={overlayKey}
                initial={entitySwapHardCut ? false : panePresence.initial}
                animate={panePresence.animate}
                exit={panePresence.exit}
                transition={paneTransition}
                style={overlayPaneStyle(entitySwapHardCut)}
                className="absolute inset-0 flex min-h-0 flex-col bg-surface-card"
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

        <div
          className="shrink-0 bg-surface-card px-3 pt-2"
          data-testid="scan-out-bottom-dock"
        >
          <ScanOutComposerDock autoFocus />
        </div>
      </div>
    </div>
  );
}
