'use client';

/**
 * The Picker desk's right pane: the shipping workspace (Pending / Urgent /
 * History), with the active order or an Up Next preview crossfading over it.
 */

import {
  AnimatePresence,
  motion,
  motionRole,
  useMotionRole,
  useOverlaySwapHardCut,
} from '@/design-system/motion';
import { ShippingWorkspaceView } from '@/components/tech/shipping/ShippingWorkspaceView';
import { ActiveOrderWorkspace } from '@/components/tech/ActiveOrderWorkspace';
import { SearchFindPreviewEmbed } from '@/components/search/SearchFindPreviewEmbed';
import { zIndex } from '@/design-system/tokens/z-index';
import { appWorkCanvasClass } from '@/design-system/tokens/app-surface';
import { appSurfaceFillClass } from '@/design-system/components/AppSurfaceFill';
import { cn } from '@/utils/_cn';
import type { SearchSelection } from '@/lib/search/search-selection';
import type { PickActiveOrderPane } from '@/components/pick/usePickOrderPanes';

interface PickOrderWorkspaceProps {
  pickerId: string;
  activeOrderPane: PickActiveOrderPane | null;
  onCloseActiveOrder: () => void;
  /** Sync condition (and other local fields) after Displays edits. */
  onActiveOrderChange?: (next: PickActiveOrderPane['activeOrder']) => void;
  previewSel: SearchSelection | null;
  onClosePreview: () => void;
}

export function PickOrderWorkspace({
  pickerId,
  activeOrderPane,
  onCloseActiveOrder,
  onActiveOrderChange,
  previewSel,
  onClosePreview,
}: PickOrderWorkspaceProps) {
  const { presence: panePresence, transition: paneTransition } = useMotionRole(
    motionRole.swap.scan,
  );
  const showOverlay = !!activeOrderPane || !!previewSel;

  const entitySwapHardCut = useOverlaySwapHardCut(showOverlay);

  const overlayKey = activeOrderPane
    ? `active-${activeOrderPane.activeOrder.tracking || activeOrderPane.activeOrder.orderId}`
    : previewSel
      ? `preview-${previewSel.entityType}:${previewSel.id}`
      : 'none';

  return (
    <div className={cn(appWorkCanvasClass, 'relative h-full')}>
      <div
        className={`flex h-full min-h-0 w-full flex-col ${showOverlay ? 'pointer-events-none' : ''}`}
        aria-hidden={showOverlay ? true : undefined}
        inert={showOverlay ? true : undefined}
        style={{ visibility: showOverlay ? 'hidden' : 'visible' }}
      >
        <ShippingWorkspaceView techId={pickerId} />
      </div>

      <AnimatePresence
        initial={false}
        mode={entitySwapHardCut ? 'sync' : 'wait'}
      >
        {activeOrderPane ? (
          <motion.div
            key={overlayKey}
            initial={entitySwapHardCut ? false : panePresence.initial}
            animate={panePresence.animate}
            exit={panePresence.exit}
            transition={paneTransition}
            style={{ zIndex: zIndex.panel + (entitySwapHardCut ? 1 : 0) }}
            className={cn('absolute inset-0 flex min-h-0 flex-col', appSurfaceFillClass('canvas'))}
          >
            <ActiveOrderWorkspace
              activeOrder={activeOrderPane.activeOrder}
              onClose={onCloseActiveOrder}
              setActiveOrder={(next) => {
                if (!next) {
                  onCloseActiveOrder();
                  return;
                }
                onActiveOrderChange?.(next);
              }}
            />
          </motion.div>
        ) : previewSel ? (
          <motion.div
            key={overlayKey}
            initial={entitySwapHardCut ? false : panePresence.initial}
            animate={panePresence.animate}
            exit={panePresence.exit}
            transition={paneTransition}
            style={{ zIndex: zIndex.panel + (entitySwapHardCut ? 1 : 0) }}
            className={cn('absolute inset-0 flex min-h-0 flex-col', appSurfaceFillClass('canvas'))}
          >
            <SearchFindPreviewEmbed sel={previewSel} onClose={onClosePreview} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
