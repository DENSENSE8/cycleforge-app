'use client';

/**
 * Pack papers / manuals print status — middle-pane surface (not the scan column).
 *
 * Reprint must not steal wedge focus: preventDefault on mousedown keeps the
 * scan input focused; emitPackerFocusScan hands focus back after the act.
 */

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { Button } from '@/design-system/primitives';
import {
  dispatchPackPrintBundleUi,
  emitPackerFocusScan,
  subscribePackPrintBundleUi,
  triggerPackPrintBundle,
  type PrintBundleUiState,
} from '@/components/packer/pack-print-bundle';
import { STATION_WORKBENCH_IDENTITY_COLUMN } from '@/components/station/workbench/workbench-layout';

export function PackPapersStatusCard({ orderRowId }: { orderRowId: number | null }) {
  const cardPresence = useMotionPresence(framerPresence.stationCard);
  const cardTransition = useMotionTransition(framerTransition.stationCardMount);
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
    <div className={`shrink-0 ${STATION_WORKBENCH_IDENTITY_COLUMN} pb-2 pt-1`}>
      <AnimatePresence mode="wait">
        <motion.div
          key={`print-${printBundleUi.status}-${printBundleUi.orderRowId}`}
          {...cardPresence}
          transition={cardTransition}
          className={
            printBundleUi.status === 'failed' || printBundleUi.status === 'missing'
              ? 'rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5'
              : printBundleUi.status === 'printing'
                ? 'rounded-2xl border border-border-soft bg-surface-card px-3 py-2.5'
                : 'rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2.5'
          }
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
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
