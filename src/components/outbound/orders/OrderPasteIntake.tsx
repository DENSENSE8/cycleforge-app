'use client';

/**
 * Paste / drop intake for the To-ship desk — mount-only, paints nothing.
 *
 * A screenshot of an orders list or a CSV pasted onto the desk's one mouth
 * (or onto the bare desk) becomes the same `orders-import` staging draft the
 * Import-from-CSV picker builds — same grid, same rail, same Confirm. This is
 * an intake, not a surface: no second dock, no card, no caption. Feedback rides
 * the toast rail until the desk mouth exposes its `reaction` slot
 * (WeldedFeedbackPanel) to page-level callers.
 *
 * Mechanism and scope rules live in {@link useOrderPasteIntake}. Mount ONCE per
 * desk, beside the file picker's hidden input.
 */

import { useOrderPasteIntake } from '@/hooks/useOrderPasteIntake';

export function OrderPasteIntake() {
  useOrderPasteIntake();
  return null;
}
