'use client';

/**
 * The tech dashboard's right pane, swapped by sidebar mode:
 *   - receiving ........ the inbound receiving feed
 *   - testing .......... Testing workbench (Pending · Returns | History) with
 *                        the focused line panel crossfading over it
 *   - history (default)  Shipping workspace (Pending · FBA | History), OVER which a
 *     scanned/active order — or an Up Next preview — crossfades and back.
 * Pure presentational; state comes from the dashboard's hooks.
 */

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { framerPresence } from '@/design-system/foundations/motion-framer';
import { useMotionPresence } from '@/design-system/foundations/motion-framer-hooks';
import { ShippingWorkspaceView } from '@/components/tech/shipping/ShippingWorkspaceView';
import { ReceivingInboundFeed } from '@/components/station/ReceivingInboundFeed';
import { ActiveOrderWorkspace } from '@/components/tech/ActiveOrderWorkspace';
import { TestingLineWorkspace } from '@/components/tech/TestingLineWorkspace';
import { previewOrderToActiveShape } from '@/components/tech/tech-dashboard-helpers';
import type { ReceivingDetailsLog } from '@/components/station/receiving-details-log';
import type { Order } from '@/components/station/upnext/upnext-types';
import type { TechActiveOrderPane } from '@/components/tech/useTechOrderPanes';
import type { TechRightViewMode } from '@/components/tech/useTechRightView';

interface TechRightPaneProps {
  rightViewMode: TechRightViewMode;
  techId: string;
  testingLineId: number | null;
  onTestingLineChange: React.Dispatch<React.SetStateAction<number | null>>;
  testingSelectMode: boolean;
  onToggleTestingSelect: () => void;
  onOpenTestingLine: () => void;
  activeOrderPane: TechActiveOrderPane | null;
  onCloseActiveOrder: () => void;
  previewOrder: Order | null;
  onClosePreview: () => void;
  onSelectLog: (log: ReceivingDetailsLog) => void;
}

export function TechRightPane({
  rightViewMode,
  techId,
  testingLineId,
  onTestingLineChange,
  testingSelectMode,
  onToggleTestingSelect,
  onOpenTestingLine,
  activeOrderPane,
  onCloseActiveOrder,
  previewOrder,
  onClosePreview,
  onSelectLog,
}: TechRightPaneProps) {
  // Canonical right-pane fade; centralizes prefers-reduced-motion via the hook.
  const tabFade = useMotionPresence(framerPresence.tableRow);
  if (rightViewMode === 'receiving') {
    return <ReceivingInboundFeed onSelectLog={onSelectLog} />;
  }

  if (rightViewMode === 'testing') {
    // Testing mode → queue/history workbench; focused line crossfades over it.
    return (
      <TestingLineWorkspace
        staffId={techId}
        selectedLineId={testingLineId}
        onSelectedLineChange={onTestingLineChange}
        testingSelectMode={testingSelectMode}
        onToggleTestingSelect={onToggleTestingSelect}
        onOpenTestingLine={onOpenTestingLine}
      />
    );
  }

  // Shipping mode: Workbench (Pending · FBA | History); active/preview order
  // crossfades over it and back.
  return (
    <AnimatePresence initial={false} mode="wait">
      {activeOrderPane ? (
        <ActiveOrderWorkspace
          key={`workspace-active-${activeOrderPane.activeOrder.tracking || activeOrderPane.activeOrder.orderId}`}
          activeOrder={activeOrderPane.activeOrder}
          onClose={onCloseActiveOrder}
        />
      ) : previewOrder ? (
        <ActiveOrderWorkspace
          key={`workspace-preview-${previewOrder.id}`}
          activeOrder={previewOrderToActiveShape(previewOrder)}
          mode="preview"
          previewOrder={previewOrder}
          onClose={onClosePreview}
        />
      ) : (
        <motion.div
          key={`tech-tab-${rightViewMode}`}
          initial={tabFade.initial}
          animate={tabFade.animate}
          exit={tabFade.exit}
          transition={{ duration: 0.16 }}
          className="flex h-full min-h-0 w-full flex-col"
        >
          <ShippingWorkspaceView techId={techId} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
