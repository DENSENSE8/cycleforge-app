'use client';

/**
 * "Is a desk inspector showing right now?" — the one answer, read off the
 * right-rail store rather than re-derived per surface.
 *
 * Band 3's **Show / Hide inspector** ({@link WorkbenchInspectorToggle}) needs to
 * know whether an occupant exists before it can park one. Surfaces that already
 * hold that fact locally (To-ship's `openOrderId`, Unbox History's
 * `historyTriageOpen`) keep their own signal; every other desk grid asks here
 * instead of plumbing a boolean up from the row that opened the peek.
 *
 * The id is matched by **prefix**, because occupants that walk a queue register
 * a stable id (`detail:incoming`) while per-entity ones append the record
 * (`detail:sku:<sku>`) — SoT: source-of-truth.md → Right-rail modality.
 */

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
