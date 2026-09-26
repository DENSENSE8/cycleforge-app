'use client';

/** Pack right-pane shell — browse workbench always mounted; focused order workspace crossfades over it (UnboxLineWorkspace pattern). */

import {
  AnimatePresence,
  motion,
  motionRole,
  useMotionRole,
  useOverlaySwapHardCut,
} from '@/design-system/motion';
import { PackWorkspaceView } from '@/components/packer/PackWorkspaceView';
import { PackOrderPanel } from '@/components/packer/PackOrderPanel';
import { PackFbaScanCard } from '@/components/packer/PackFbaScanCard';
import { zIndex } from '@/design-system/tokens/z-index';
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
      <div
        className={`flex h-full min-h-0 w-full flex-col ${showOverlay ? 'pointer-events-none' : ''}`}
        aria-hidden={showOverlay ? true : undefined}
        inert={showOverlay ? true : undefined}
        style={{ visibility: showOverlay ? 'hidden' : 'visible' }}
      >
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
            style={{ zIndex: zIndex.panel + (entitySwapHardCut ? 1 : 0) }}
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
            style={{ zIndex: zIndex.panel + (entitySwapHardCut ? 1 : 0) }}
            className={cn('absolute inset-0 flex min-h-0 flex-col', appSurfaceFillClass('canvas'))}
          >
            <PackOrderPanel activeOrder={activeOrder} onClose={onCloseActiveOrder} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
