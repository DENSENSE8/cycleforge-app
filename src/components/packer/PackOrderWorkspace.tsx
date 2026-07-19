'use client';

/**
 * Pack right-pane shell — browse workbench always mounted; focused order
 * workspace crossfades over it (UnboxLineWorkspace pattern).
 */

import { AnimatePresence, motion } from 'framer-motion';
import { PackWorkspaceView } from '@/components/packer/PackWorkspaceView';
import { PackOrderPanel } from '@/components/packer/PackOrderPanel';
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
import type { PackActiveOrderPane } from '@/components/packer/usePackerOrderPane';

interface PackOrderWorkspaceProps {
  packerId: number;
  activeOrder: PackActiveOrderPane | null;
  onCloseActiveOrder: () => void;
}

export function PackOrderWorkspace({
  packerId,
  activeOrder,
  onCloseActiveOrder,
}: PackOrderWorkspaceProps) {
  const panePresence = useMotionPresence(framerPresence.workbenchPaneSettle);
  const paneTransition = useMotionTransition(framerTransition.workbenchPaneSettle);
  const showOverlay = !!activeOrder;

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
        {showOverlay && activeOrder ? (
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
            className="absolute inset-0 flex min-h-0 flex-col bg-surface-card"
          >
            <PackOrderPanel activeOrder={activeOrder} onClose={onCloseActiveOrder} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
