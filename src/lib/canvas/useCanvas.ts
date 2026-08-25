'use client';

/**
 * React bindings for the canvas store. Thin by design — every mutation is a
 * plain function on the store, so a component never owns arrangement state and a
 * test never needs React to exercise one.
 */

import { useSyncExternalStore } from 'react';
import {
  getCanvasSnapshot,
  getServerCanvasSnapshot,
  subscribeCanvas,
  type CanvasSnapshot,
} from '@/lib/canvas/store';

export function useCanvas(): CanvasSnapshot {
  return useSyncExternalStore(subscribeCanvas, getCanvasSnapshot, getServerCanvasSnapshot);
}

/** Is this the pane the operator is working in? Drives the tile's active chrome. */
export function useIsPaneFocused(groupId: string): boolean {
  return useCanvas().focusedGroupId === groupId;
}
