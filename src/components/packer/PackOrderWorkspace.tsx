'use client';

/**
 * Pack right-pane shell — browse workbench always mounted; focused order
 * workspace crossfades over it (UnboxLineWorkspace pattern).
 */

import { AnimatePresence, motion } from '@/design-system/motion';
import { PackWorkspaceView } from '@/components/packer/PackWorkspaceView';
import { PackOrderPanel } from '@/components/packer/PackOrderPanel';
import { PackFbaScanCard } from '@/components/packer/PackFbaScanCard';
import {
  framerPresence,
  framerTransition,
} from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { zIndex } from '@/design-system/tokens/z-index';
import { appWorkCanvasClass } from '@/design-system/tokens/app-surface';
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
  const panePresence = useMotionPresence(framerPresence.workbenchPaneSettle);
  const paneTransition = useMotionTransition(framerTransition.workbenchPaneSettle);
  const showOverlay = !!activeOrder || !!activeFba;

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

      <AnimatePresence initial={false} mode="wait">
        {activeFba ? (
          <motion.div
            key={`fba-${activeFba.fnsku || activeFba.shipmentRef || 'scan'}`}
            initial={panePresence.initial}
            animate={panePresence.animate}
            exit={panePresence.exit}
            transition={paneTransition}
            style={{ zIndex: zIndex.panel }}
            className="absolute inset-0 flex min-h-0 flex-col overflow-y-auto bg-surface-sunken"
          >
            <PackFbaScanCard scan={activeFba} />
          </motion.div>
        ) : showOverlay && activeOrder ? (
          <motion.div
            key={
              activeOrder.scanDriven
                ? `scan-${activeOrder.orderRowId ?? activeOrder.serialUnitId ?? activeOrder.tracking}`
                : `row-${activeOrder.orderRowId ?? activeOrder.tracking}`
            }
            initial={panePresence.initial}
            animate={panePresence.animate}
            exit={panePresence.exit}
            transition={paneTransition}
            style={{ zIndex: zIndex.panel }}
            className="absolute inset-0 flex min-h-0 flex-col"
          >
            <PackOrderPanel activeOrder={activeOrder} onClose={onCloseActiveOrder} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
