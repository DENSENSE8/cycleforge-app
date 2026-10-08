'use client';

/** Pack papers / manuals print status — StationWorkbench `feedback` slot (Unbox action-feedback plane), never an advisory strip between… */

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, motionRole, useMotionRole } from '@/design-system/motion';
import { Button } from '@/design-system/primitives';
import {
  dispatchPackPrintBundleUi,
  emitPackerFocusScan,
  subscribePackPrintBundleUi,
  triggerPackPrintBundle,
  type PrintBundleUiState,
} from '@/lib/print/pack-print-bundle-client';
import { STATION_WORKBENCH_IDENTITY_COLUMN } from '@/components/station/workbench/workbench-layout';
import { PHONE_CARD_FACE } from '@/design-system/tokens/phone-card';

export function PackPapersStatusCard({ orderRowId }: { orderRowId: number | null }) {
  const { presence, transition } = useMotionRole(motionRole.swap.scan);
  const [printBundleUi, setPrintBundleUi] = useState<PrintBundleUiState | null>(null);

  useEffect(() => {
    return subscribePackPrintBundleUi((detail) => {
      if (detail == null) {
        setPrintBundleUi(null);
        return;
      }
      // Only show status for the order currently open in the middle pane.
      if (orderRowId != null && detail.orderRowId != null && detail.orderRowId !== orderRowId) {
        return;
      }
      setPrintBundleUi(detail);
    });
  }, [orderRowId]);

  // Drop stale status when the operator closes / switches orders.
  useEffect(() => {
    if (orderRowId == null) {
      setPrintBundleUi(null);
      return;
    }
    if (printBundleUi?.orderRowId != null && printBundleUi.orderRowId !== orderRowId) {
      setPrintBundleUi(null);
    }
  }, [orderRowId, printBundleUi?.orderRowId]);

  if (!printBundleUi || printBundleUi.status === 'idle') return null;

  const handleReprint = () => {
    const rowId = printBundleUi.orderRowId;
    if (!rowId) return;
    const next: PrintBundleUiState = {
      ...printBundleUi,
      status: 'printing',
      message: 'Reprinting…',
    };
    setPrintBundleUi(next);
    dispatchPackPrintBundleUi(next);
    emitPackerFocusScan();
    void triggerPackPrintBundle({
      orderRowId: rowId,
      packerLogId: printBundleUi.packerLogId,
      reprint: true,
    }).then((result) => {
      setPrintBundleUi(result);
      dispatchPackPrintBundleUi(result);
      emitPackerFocusScan();
    });
  };

  return (
    <div className={`shrink-0 ${STATION_WORKBENCH_IDENTITY_COLUMN}`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`print-${printBundleUi.status}-${printBundleUi.orderRowId}`}
          initial={presence.initial}
          animate={presence.animate}
          exit={presence.exit}
          transition={transition}
          className={`${PHONE_CARD_FACE} ${
            printBundleUi.status === 'failed' || printBundleUi.status === 'missing'
              ? 'border border-border-warning bg-surface-warning px-3 py-2.5'
              : printBundleUi.status === 'printing'
                ? 'border border-border-soft bg-surface-card px-3 py-2.5'
                : 'border border-border-success bg-surface-success px-3 py-2.5'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-role-eyebrow text-text-soft">
                Pack papers
              </p>
              <p className="mt-1 text-role-caption font-semibold text-text-default">
                {printBundleUi.message || 'Working…'}
              </p>
            </div>
            {printBundleUi.orderRowId &&
            printBundleUi.status !== 'printing' &&
            printBundleUi.status !== 'missing' ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                // Keep wedge focus on the scan bar — never park on Reprint.
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleReprint}
              >
                Reprint
              </Button>
            ) : null}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
