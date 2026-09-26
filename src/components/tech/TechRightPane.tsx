'use client';

/** The tech dashboard's right pane, swapped by sidebar mode: */

import React from 'react';
import {
  AnimatePresence,
  motion,
  motionRole,
  useMotionRole,
  useOverlaySwapHardCut,
} from '@/design-system/motion';
import { ShippingWorkspaceView } from '@/components/tech/shipping/ShippingWorkspaceView';
import { ReceivingInboundFeed } from '@/components/station/ReceivingInboundFeed';
import { ActiveOrderWorkspace } from '@/components/tech/ActiveOrderWorkspace';
import { TestingLineWorkspace } from '@/components/tech/TestingLineWorkspace';
import { SearchFindPreviewEmbed } from '@/components/search/SearchFindPreviewEmbed';
import { zIndex } from '@/design-system/tokens/z-index';
import { appWorkCanvasClass } from '@/design-system/tokens/app-surface';
import { appSurfaceFillClass } from '@/design-system/components/AppSurfaceFill';
import { cn } from '@/utils/_cn';
import type { SearchSelection } from '@/lib/search/search-selection';
import type { TechActiveOrderPane } from '@/components/tech/useTechOrderPanes';
import type { TechRightViewMode } from '@/components/tech/useTechRightView';

interface TechRightPaneProps {
  rightViewMode: TechRightViewMode;
  techId: string;
  testingLineId: number | null;
  onTestingLineChange: React.Dispatch<React.SetStateAction<number | null>>;
  testingSelectMode: boolean;
  onOpenTestingLine: () => void;
  activeOrderPane: TechActiveOrderPane | null;
  onCloseActiveOrder: () => void;
  /** Sync condition (and other local fields) after Displays edits. */
  onActiveOrderChange?: (next: TechActiveOrderPane['activeOrder']) => void;
  previewSel: SearchSelection | null;
  onClosePreview: () => void;
}

export function TechRightPane({
  rightViewMode,
  techId,
  testingLineId,
  onTestingLineChange,
  testingSelectMode,
  onOpenTestingLine,
  activeOrderPane,
  onCloseActiveOrder,
  onActiveOrderChange,
  previewSel,
  onClosePreview,
}: TechRightPaneProps) {
  if (rightViewMode === 'receiving') {
    return <ReceivingInboundFeed />;
  }

  if (rightViewMode === 'testing') {
    // Testing mode → queue/history workbench; focused line crossfades over it.
    return (
      <TestingLineWorkspace
        staffId={techId}
        selectedLineId={testingLineId}
        onSelectedLineChange={onTestingLineChange}
        testingSelectMode={testingSelectMode}
        onOpenTestingLine={onOpenTestingLine}
      />
    );
  }

  return (
    <ShippingOrderWorkspace
      techId={techId}
      activeOrderPane={activeOrderPane}
      onCloseActiveOrder={onCloseActiveOrder}
      onActiveOrderChange={onActiveOrderChange}
      previewSel={previewSel}
      onClosePreview={onClosePreview}
    />
  );
}

function ShippingOrderWorkspace({
  techId,
  activeOrderPane,
  onCloseActiveOrder,
  onActiveOrderChange,
  previewSel,
  onClosePreview,
}: {
  techId: string;
  activeOrderPane: TechActiveOrderPane | null;
  onCloseActiveOrder: () => void;
  onActiveOrderChange?: (next: TechActiveOrderPane['activeOrder']) => void;
  previewSel: SearchSelection | null;
  onClosePreview: () => void;
}) {
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
        <ShippingWorkspaceView techId={techId} />
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
