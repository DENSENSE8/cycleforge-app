'use client';

/**
 * Pack right-pane shell — browse workbench always mounted; focused order
 * workspace crossfades over it (UnboxLineWorkspace pattern).
 *
 * Motion is the STATION cadence preset (`motionRole.swap.scan`), not the pointer
 * `workbenchPaneSettle`. Exit is instant.
 *
 * - Browse→first open: `mode="wait"` + enter fade (~0.12s).
 * - Order→order (next scan): `mode="sync"` + hard-cut enter so the new opaque
 *   pane covers the old one — `mode="wait"` would punch a hole through the host.
 */

import {
  AnimatePresence,
  idleBrowseLayerProps,
  motion,
  motionRole,
  overlayPaneStyle,
  useMotionRole,
  useOverlaySwapHardCut,
} from '@/design-system/motion';
import { PackWorkspaceView } from '@/components/packer/PackWorkspaceView';
import { PackOrderPanel } from '@/components/packer/PackOrderPanel';
import { PackFbaScanCard } from '@/components/packer/PackFbaScanCard';
import { appWorkCanvasClass } from '@/design-system/tokens/app-surface';
import { appSurfaceFillClass } from '@/design-system/components/AppSurfaceFill';
import { cn } from '@/utils/_cn';
import type {
  PackActiveFbaPane,
  PackActiveOrderPane,
} from '@/components/packer/usePackerOrderPane';

interface PackOrderWorkspaceProps {
  packerId: number;
  activeOrder: PackActiveOrderPane | null;
  /**
   * FBA scan result — the bench's other active entity. Mutually exclusive with
   * `activeOrder` by construction (`usePackerOrderPane` clears one when the
   * other arrives), so the overlay never has to pick a winner.
   */
  activeFba?: PackActiveFbaPane | null;
  onCloseActiveOrder: () => void;
}

export function PackOrderWorkspace({
  packerId,
  activeOrder,
  activeFba = null,
  onCloseActiveOrder,
}: PackOrderWorkspaceProps) {
  const { presence: panePresence, transition: paneTransition } = useMotionRole(
    motionRole.swap.scan,
  );
  const showOverlay = !!activeOrder || !!activeFba;

  const entitySwapHardCut = useOverlaySwapHardCut(showOverlay);

  const overlayKey = activeFba
    ? `fba-${activeFba.fnsku || activeFba.shipmentRef || 'scan'}`
    : activeOrder
      ? activeOrder.scanDriven
        ? `scan-${activeOrder.orderRowId ?? activeOrder.serialUnitId ?? activeOrder.tracking}`
        : `row-${activeOrder.orderRowId ?? activeOrder.tracking}`
      : 'none';

  return (
    <div className={cn(appWorkCanvasClass, 'relative h-full')}>
      <div {...idleBrowseLayerProps(showOverlay, 'flex h-full min-h-0 w-full flex-col')}>
        <PackWorkspaceView packerId={packerId} />
      </div>

      <AnimatePresence
        initial={false}
        mode={entitySwapHardCut ? 'sync' : 'wait'}
      >
        {activeFba ? (
          <motion.div
            key={overlayKey}
            initial={entitySwapHardCut ? false : panePresence.initial}
            animate={panePresence.animate}
            exit={panePresence.exit}
            transition={paneTransition}
            style={overlayPaneStyle(entitySwapHardCut)}
            className="absolute inset-0 flex min-h-0 flex-col overflow-y-auto bg-surface-canvas"
          >
            <PackFbaScanCard scan={activeFba} />
          </motion.div>
        ) : showOverlay && activeOrder ? (
          <motion.div
            key={overlayKey}
            initial={entitySwapHardCut ? false : panePresence.initial}
            animate={panePresence.animate}
            exit={panePresence.exit}
            transition={paneTransition}
            style={overlayPaneStyle(entitySwapHardCut)}
            className={cn('absolute inset-0 flex min-h-0 flex-col', appSurfaceFillClass('canvas'))}
          >
            <PackOrderPanel activeOrder={activeOrder} onClose={onCloseActiveOrder} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
