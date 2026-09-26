'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import {
  claimOverlay,
  getOverlayDepth,
  getServerOverlayDepth,
  subscribeOverlayStack,
  type OverlayClaim,
} from '@/lib/overlay-stack/store';

/** Register an open overlay with the keyboard-ownership stack for as long as `active` is true. */
export function useRegisterOverlay(active: boolean): () => boolean {
  const claimRef = useRef<OverlayClaim | null>(null);
  useEffect(() => {
    if (!active) return undefined;
    const claim = claimOverlay();
    claimRef.current = claim;
    return () => {
      claim.release();
      if (claimRef.current === claim) claimRef.current = null;
    };
  }, [active]);
  return useCallback(() => claimRef.current?.isTopmost() ?? false, []);
}

/** Subscribe to "is any overlay open right now". */
export function useAnyOverlayOpen(): boolean {
  return (
    useSyncExternalStore(subscribeOverlayStack, getOverlayDepth, getServerOverlayDepth) > 0
  );
}
