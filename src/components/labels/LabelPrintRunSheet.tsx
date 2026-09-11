'use client';

/**
 * Legacy BottomSheet entry for print-run — Labels/Racks mount
 * {@link LabelPrintRunPanel} inline. Re-exports freeze type for callers.
 *
 * Callers that still imported LabelPrintRunSheet: BinLabelPrinter, RackLabelPrinter
 * (switching to LabelPrintRunPanel). No data files.
 * User: "Implement the plan as specified" — Inline Labels print-run (no popover).
 */

export {
  LabelPrintRunPanel,
  type LabelPrintRunFreeze,
  type LabelPrintRunPanelProps,
} from '@/components/labels/LabelPrintRunPanel';
