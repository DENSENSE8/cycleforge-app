/**
 * Visible page ids for the mounted slot table.
 *
 * DataTable pages internally; selection hooks live in parents, so they cannot
 * see the page through React context. This registry is the seam: the table
 * publishes the ids on screen, and Select all / Deselect all read them.
 */
const byScope = new Map<string, readonly number[]>();

export function publishSlotTableVisibleIds(scope: string, ids: readonly number[]): void {
  byScope.set(scope, ids);
}

export function slotTableVisibleIds(scope: string): readonly number[] | null {
  return byScope.get(scope) ?? null;
}

export function clearSlotTableVisibleIds(scope: string): void {
  byScope.delete(scope);
}

export function slotTableSelectableIds(
  scope: string,
  fallback: readonly number[],
): readonly number[] {
  const published = byScope.get(scope);
  return published && published.length > 0 ? published : fallback;
}
