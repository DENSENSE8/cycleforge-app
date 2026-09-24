'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import {
  claimOverlay,
  getOverlayDepth,
  getServerOverlayDepth,
  subscribeOverlayStack,
  type OverlayClaim,
} from '@/lib/overlay-stack/store';

/**
 * Register an open overlay with the keyboard-ownership stack for as long as
 * `active` is true. See `src/lib/overlay-stack/store.ts` for why this exists —
 * in one line: **the innermost open overlay owns Escape**, so ambient keyboard
 * owners can stand down instead of stealing the keystroke in capture phase.
 *
 * Returns a stable `isTopmost()` for overlays that own their own Escape
 * listener: a stacked sheet (confirm over an action sheet) and its parent both
 * hear the key, and only the one on top may act on it.
 *
 * `AnchoredLayer` calls this, which covers every house Popover / DropdownMenu /
 * ContextMenu / cell editor / Calendar for free. A bespoke overlay that portals
 * its own panel should call it too.
 */
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

/**
 * Subscribe to "is any overlay open right now". For ambient Escape owners that
 * must yield reactively (the right-rail host disables its Escape handler while
 * a popover is up). Imperative consumers inside an event handler should call
 * `hasOpenOverlay()` directly instead of subscribing.
 */
export function useAnyOverlayOpen(): boolean {
  return (
    useSyncExternalStore(subscribeOverlayStack, getOverlayDepth, getServerOverlayDepth) > 0
  );
}
