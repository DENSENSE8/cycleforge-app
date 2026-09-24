/**
 * Visible page ids for the mounted slot table.
 *
 * DataTable pages internally; selection hooks live in parents, so they cannot
 * see the page through React context. This registry is the seam: the table
 * publishes the ids on screen, and Select all / Deselect all read them.
 *
 * An id is whatever the surface's `getRowId` returns. Most families key on a
 * numeric PK; a JUNCTION family cannot — the retired Inventory › Stock desk
 * keyed on `(location, sku, source)`, and forcing that through
 * `Number()` yielded `NaN`, which this registry then dropped. The scope's
 * selection total came out 0 while rows were plainly on screen, so the header
 * checkbox read "all selected" at one tick. Hence {@link SlotTableRowId}: the
 * registry is agnostic, and each SCOPE carries one id vocabulary.
 */

/** A row key as the surface's `getRowId` reports it. */
export type SlotTableRowId = string | number;

const byScope = new Map<string, readonly SlotTableRowId[]>();

export function publishSlotTableVisibleIds(
  scope: string,
  ids: readonly SlotTableRowId[],
): void {
  byScope.set(scope, ids);
}

export function slotTableVisibleIds(scope: string): readonly SlotTableRowId[] | null {
  return byScope.get(scope) ?? null;
}

export function clearSlotTableVisibleIds(scope: string): void {
  byScope.delete(scope);
}

/**
 * The ids Select-all may tick: the published page when there is one, else the
 * caller's own list.
 *
 * The cast is the scope invariant stated above — one surface publishes a scope,
 * so the published vocabulary is the caller's. It is not a widening: a caller
 * that keys on numbers can only ever read back the numbers it published.
 */
export function slotTableSelectableIds<Id extends SlotTableRowId>(
  scope: string,
  fallback: readonly Id[],
): readonly Id[] {
  const published = byScope.get(scope);
  return published && published.length > 0 ? (published as readonly Id[]) : fallback;
}
