'use client';

/** Returns-banner state for the receiving sidebar's Unbox mode, plus the shared serial-input ref the scan-apply layer refocuses. */

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
