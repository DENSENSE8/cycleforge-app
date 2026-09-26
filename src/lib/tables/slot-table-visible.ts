/** Visible page ids for the mounted slot table. */

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

/** The ids Select-all may tick: */
export function slotTableSelectableIds<Id extends SlotTableRowId>(
  scope: string,
  fallback: readonly Id[],
): readonly Id[] {
  const published = byScope.get(scope);
  return published && published.length > 0 ? (published as readonly Id[]) : fallback;
}
