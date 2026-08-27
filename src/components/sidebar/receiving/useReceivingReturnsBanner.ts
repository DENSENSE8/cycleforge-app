'use client';

/**
 * Returns-banner state for the receiving sidebar's Unbox mode, plus the shared
 * serial-input ref the scan-apply layer refocuses.
 *
 * This hook used to own a `submitSerialScan` flow (serial input + submit +
 * multi-candidate picker). That tail had **zero call sites** — the sidebar
 * renders no serial input; the real serial capture lives in the Unbox line
 * workspace (`useLineSerials`). It was removed in capture-stack Phase 0 as
 * hygiene, not as a behavior change.
 *
 * Consequence, stated honestly: with the submit path gone there is currently
 * no producer for `returns`, so `ReceivingReturnBanner` renders empty — which
 * is exactly what it already did, since the producer was unreachable. Phase 3
 * re-wires return detection through the capture stack's single input.
 */

import { useCallback, useRef, useState } from 'react';
import type { ReturnEvent } from '@/components/sidebar/ReceivingReturnBanner';

interface ReceivingReturnsBannerState {
  /**
   * Focus target for a scan that opens a carton on the Unbox surface
   * (`scan-apply.ts` → `refocusScanInput`). No input attaches to it today;
   * capture-stack Phase 3 mounts the anchored input here.
   */
  serialInputRef: React.RefObject<HTMLInputElement | null>;
  returns: ReturnEvent[];
  dismissReturn: (id: string) => void;
  clearReturns: () => void;
}

export function useReceivingReturnsBanner(): ReceivingReturnsBannerState {
  const [returns, setReturns] = useState<ReturnEvent[]>([]);
  const serialInputRef = useRef<HTMLInputElement>(null);

  const dismissReturn = useCallback((id: string) => {
    setReturns((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const clearReturns = useCallback(() => setReturns([]), []);

  return { serialInputRef, returns, dismissReturn, clearReturns };
}
