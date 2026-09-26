'use client';

/** Rail action store — the bridge between the grid's selection and the rail's action region. */

import type { SelectionAction } from '@/lib/selection/selection-actions';

interface RailActionSnapshot<T = unknown> {
  /** Selection scope the rows came from — the key for `emitToggleAll`. */
  scope: string;
  /** Currently selected rows, in selection order. */
  rows: T[];
  /** The family's verb catalog, already narrowed to the verbs this mount can resolve (`offeredSelectionActions`). */
  actions: SelectionAction<T>[];
  /** Selectable rows on screen — the "N of M" denominator. */
  total: number;
}

const EMPTY: RailActionSnapshot = { scope: '', rows: [], actions: [], total: 0 };

let snapshot: RailActionSnapshot = EMPTY;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** Publish the live selection + its actions. */
export function publishRailActions<T>(next: RailActionSnapshot<T>): void {
  const prev = snapshot;
  if (
    prev.scope === next.scope &&
    prev.total === next.total &&
    prev.actions === (next.actions as SelectionAction<unknown>[]) &&
    prev.rows.length === next.rows.length &&
    prev.rows.every((row, i) => row === next.rows[i])
  ) {
    return;
  }
  snapshot = next as RailActionSnapshot;
  emit();
}

/** Drop the published selection (the publisher unmounting, or a cleared set). */
export function clearRailActions(scope: string): void {
  // Scope-guarded so a surface unmounting after another one published does not
  // wipe the newer owner's snapshot.
  if (snapshot.scope !== scope) return;
  snapshot = EMPTY;
  emit();
}

export function subscribeRailActions(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRailActions(): RailActionSnapshot {
  return snapshot;
}

/** Server snapshot: the rail is client-only chrome. */
export function getServerRailActions(): RailActionSnapshot {
  return EMPTY;
}
