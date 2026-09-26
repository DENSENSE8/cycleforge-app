'use client';

/** Paste / drop intake for the To-ship desk — mount-only, paints nothing. */

import { useOrderPasteIntake } from '@/hooks/useOrderPasteIntake';

export function OrderPasteIntake() {
  useOrderPasteIntake();
  return null;
}
