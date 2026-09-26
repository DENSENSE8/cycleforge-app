'use client';

/** "Is a desk inspector showing right now?" — the one answer, read off the right-rail store rather than re-derived per surface. */

import { useCallback, useSyncExternalStore } from 'react';
import {
  getRightRailTop,
  getServerRightRailTop,
  subscribeRightRail,
} from '@/lib/right-rail/store';

/** Top occupant id, or `null` when the right edge is empty. */
export function useRightRailTopId(): string | null {
  const getSnapshot = useCallback(() => getRightRailTop()?.id ?? null, []);
  const getServerSnapshot = useCallback(() => getServerRightRailTop()?.id ?? null, []);
  return useSyncExternalStore(subscribeRightRail, getSnapshot, getServerSnapshot);
}

/**
 * True while the top occupant's id equals `idOrPrefix` or starts with
 * `` `${idOrPrefix}:` `` — so `detail:sku` matches `detail:sku:ABC-1`.
 */
export function useRightRailOccupantOpen(idOrPrefix: string): boolean {
  const topId = useRightRailTopId();
  if (topId == null) return false;
  return topId === idOrPrefix || topId.startsWith(`${idOrPrefix}:`);
}
