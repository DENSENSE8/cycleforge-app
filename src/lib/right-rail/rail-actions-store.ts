'use client';

/**
 * Rail action store — the bridge between the grid's selection and the rail's
 * action region.
 *
 * WHY A STORE AND NOT PROPS
 * The dashboard's selection lives in `useOrderRailSelection` (which wraps
 * `useDashboardBulkSelection` and publishes here), mounted under
 * `DashboardOrdersView`. The 1-row body it acts on — `ShippedDetailsPanel` —
 * is mounted by `GlobalDetailStackHost`, which hangs off the ROOT layout
 * (`AssistantProvider` → host), not off the dashboard page. The two are
 * siblings near the top of the tree with the whole app between them, so there
 * is no prop path from one to the other and no shared provider short of adding
 * one around the root.
 *
 * Same shape, and the same reason, as `right-rail/store.ts`,
 * `detail-stacks/open-store.ts`, `overlay-stack/store.ts` and
 * `scan-hotkey/store.ts`: a module-level subscribe/emit with a cached snapshot
 * for `useSyncExternalStore`. The publisher is whichever collection surface
 * currently owns a selection; the consumer is whatever is rendering the rail.
 *
 * ONE PUBLISHER AT A TIME. The dashboard is the only caller today. A second
 * surface publishing under a different `scope` simply replaces the snapshot —
 * which is correct, because only one collection can be the operator's live
 * selection, and the rail shows exactly one thing.
 */

import type { SelectionAction } from '@/lib/selection/selection-actions';

interface RailActionSnapshot<T = unknown> {
  /** Selection scope the rows came from — the key for `emitToggleAll`. */
  scope: string;
  /** Currently selected rows, in selection order. */
  rows: T[];
  /** Lane-scoped actions. Already filtered by the publisher's lane SoT
   *  (`orderBulkActionKeys`); the region still resolves per-selection
   *  count/predicate constraints so it never renders a dead control. */
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

/**
 * Publish the live selection + its actions. Called from an effect on the
 * collection surface (`useOrderRailSelection`).
 *
 * Identity-stable when nothing changed: the region re-renders on every
 * `useSyncExternalStore` notification, and the grid re-broadcasts its selection
 * on each change, so a naive always-replace would churn the rail's footer on
 * unrelated grid renders. The element-wise `rows` compare still earns its keep
 * after the publish/capsule split — `selectedRows` can retain object identity
 * across publishes while scope/total/actions stay equal.
 */
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
