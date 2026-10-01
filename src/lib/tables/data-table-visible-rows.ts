/** Visible page ids for a mounted DataTable. */

/** A row key as the surface's `getRowId` reports it. */
export type DataTableRowId = string | number;

const byScope = new Map<string, readonly DataTableRowId[]>();

export function publishDataTableVisibleIds(
  scope: string,
  ids: readonly DataTableRowId[],
): void {
  byScope.set(scope, ids);
}

export function clearDataTableVisibleIds(scope: string): void {
  byScope.delete(scope);
}

/** The ids Select-all may tick. */
export function dataTableSelectableIds<Id extends DataTableRowId>(
  scope: string,
  fallback: readonly Id[],
): readonly Id[] {
  const published = byScope.get(scope);
  return published && published.length > 0 ? (published as readonly Id[]) : fallback;
}
