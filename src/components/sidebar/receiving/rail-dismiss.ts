'use client';

/** Rail dismiss mechanics, shared by the two things that can dismiss a row: */

import type { QueryClient } from '@tanstack/react-query';
import {
  removeReceivingRailByCarton,
  removeReceivingRailByLine,
  restoreReceivingRailSnapshot,
  snapshotReceivingRailByCarton,
} from '@/lib/queries/receiving-queries';

/** Undo channels — the shell clears its sticky delete-suppression on these. */
export const RAIL_ENTRY_RESTORED_EVENT = 'receiving-entry-restored';
export const RAIL_LINE_RESTORED_EVENT = 'receiving-line-restored';

/** What a dismiss actually removed, so an Undo can un-suppress exactly the same ids. */
export interface RailDismissEcho {
  /** Carton ids echoed on `receiving-entry-deleted`. */
  cartonIds: number[];
  /** Line ids echoed on `receiving-line-deleted`. */
  lineIds: number[];
  /** The rail rows as they stood before the drop, so an Undo can put them back WITHOUT waiting on a refetch. */
  snapshots: ReturnType<typeof snapshotReceivingRailByCarton>[];
}

/**
 * Rail id encoding → (entity_type, entity_id) for the exclusions API: a
 * negative id is an unfound carton stub (`-receiving_id`), a positive one is a
 * receiving line. See `exclusionToRailId` for the inverse.
 */
export function railExclusionItems(
  ids: number[],
): Array<{ entityType: 'RECEIVING' | 'RECEIVING_LINE'; entityId: number }> {
  return ids.map((id) =>
    id < 0
      ? { entityType: 'RECEIVING' as const, entityId: -id }
      : { entityType: 'RECEIVING_LINE' as const, entityId: id },
  );
}

/** The carton a line-shaped rail row belongs to, read off the rail caches. */
function cartonIdForLine(queryClient: QueryClient, lineId: number): number | null {
  for (const [, rows] of queryClient.getQueriesData<
    Array<{ id: number; receiving_id?: number | null }>
  >({ queryKey: ['receiving-lines-table', 'rail'] })) {
    if (!Array.isArray(rows)) continue;
    const hit = rows.find((r) => r.id === lineId);
    if (hit?.receiving_id != null && Number.isFinite(hit.receiving_id)) return hit.receiving_id;
  }
  return null;
}

/** Drop dismissed rows from every mounted rail immediately — no global refresh, which would only un-hide them before the read filter… */
export function dropRailRows(queryClient: QueryClient, ids: number[]): RailDismissEcho {
  const echo: RailDismissEcho = { cartonIds: [], lineIds: [], snapshots: [] };
  /** Snapshot BEFORE the remove — afterwards the rows are gone from the cache. */
  const dropCarton = (receivingId: number) => {
    echo.snapshots.push(snapshotReceivingRailByCarton(queryClient, receivingId));
    removeReceivingRailByCarton(queryClient, receivingId);
    window.dispatchEvent(new CustomEvent('receiving-entry-deleted', { detail: receivingId }));
    echo.cartonIds.push(receivingId);
  };

  for (const id of ids) {
    if (id < 0) {
      dropCarton(-id);
      continue;
    }
    const receivingId = cartonIdForLine(queryClient, id);
    if (receivingId != null) dropCarton(receivingId);
    else removeReceivingRailByLine(queryClient, id);
    window.dispatchEvent(new CustomEvent('receiving-line-deleted', { detail: { id } }));
    echo.lineIds.push(id);
  }
  return echo;
}

/** Undo half, in the order that actually works: */
export function restoreRailRows(queryClient: QueryClient, echo: RailDismissEcho): void {
  for (const receivingId of echo.cartonIds) {
    window.dispatchEvent(new CustomEvent(RAIL_ENTRY_RESTORED_EVENT, { detail: receivingId }));
  }
  for (const id of echo.lineIds) {
    window.dispatchEvent(new CustomEvent(RAIL_LINE_RESTORED_EVENT, { detail: { id } }));
  }
  for (const snapshot of echo.snapshots) restoreReceivingRailSnapshot(queryClient, snapshot);
  void queryClient.invalidateQueries({ queryKey: ['receiving-lines-table', 'rail'] });
}
