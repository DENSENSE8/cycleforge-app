'use client';

import { useEffect, useSyncExternalStore } from 'react';
import {
  getOverlayDepth,
  getServerOverlayDepth,
  pushOverlay,
  subscribeOverlayStack,
} from '@/lib/overlay-stack/store';

/**
 * Register an open overlay with the keyboard-ownership stack for as long as
 * `active` is true. See `src/lib/overlay-stack/store.ts` for why this exists —
 * in one line: **the innermost open overlay owns Escape**, so ambient keyboard
 * owners can stand down instead of stealing the keystroke in capture phase.
 *
 * `AnchoredLayer` calls this, which covers every house Popover / DropdownMenu /
 * ContextMenu / cell editor / Calendar for free. A bespoke overlay that portals
 * its own panel should call it too.
 */
export function useRegisterOverlay(active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;
    return pushOverlay();
  }, [active]);
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
