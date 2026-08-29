/**
 * The per-org sheet catalog — which tables an organization runs, in what order.
 *
 * Pure resolution logic, kept out of the query module so it can be unit-tested
 * without a database. The rule it encodes is the one thing about this feature
 * that is easy to get subtly wrong:
 *
 *   **No rows means ALL, not none.**
 *
 * A catalog whose absence meant "nothing enabled" would blank every existing
 * tenant's tab strip the moment the table shipped, and the fix would be a data
 * migration seeding a row per org per table. So opting OUT is what gets stored;
 * the product default survives an empty table. `enabled: false` is a real,
 * distinct answer — it is how an org says "not this one".
 */

/** One stored catalog decision. */
export interface OrgTableRow {
  tableId: string;
  enabled: boolean;
  sortOrder: number;
}

/** A table the product offers, from `REGISTERED_BINDINGS`. */
export interface CatalogEntry {
  tableId: string;
  label: string;
}

export interface ResolvedCatalogEntry extends CatalogEntry {
  enabled: boolean;
  sortOrder: number;
  /** True when this org has recorded a decision; false = product default. */
  explicit: boolean;
}

/**
 * Resolve the product's offering against one org's stored decisions.
 *
 * Returns EVERY offered table — enabled and not — because the picker needs to
 * show what could be turned on, and the strip filters to `enabled` itself. A
 * function that returned only the enabled set would force the picker to do this
 * join a second time, differently.
 *
 * Order: stored `sortOrder` first, then the product's own order for anything
 * unstored, then `tableId` so ties are total. An org that has never reordered
 * anything therefore sees exactly the order the product ships.
 */
export function resolveOrgCatalog(
  offered: readonly CatalogEntry[],
  stored: readonly OrgTableRow[],
): ResolvedCatalogEntry[] {
  const byId = new Map(stored.map((row) => [row.tableId, row]));
  return offered
    .map((entry, index) => {
      const row = byId.get(entry.tableId);
      return {
        ...entry,
        enabled: row?.enabled ?? true,
        // Unstored entries keep their position in the product's own list, which
        // is what makes "never touched" read as "shipped order".
        sortOrder: row?.sortOrder ?? index,
        explicit: row != null,
      };
    })
    .sort(
      (a, b) => a.sortOrder - b.sortOrder || a.tableId.localeCompare(b.tableId),
    );
}

/** Just the strip: enabled entries, in order. */
export function enabledOrgTables(
  offered: readonly CatalogEntry[],
  stored: readonly OrgTableRow[],
): ResolvedCatalogEntry[] {
  return resolveOrgCatalog(offered, stored).filter((entry) => entry.enabled);
}

/**
 * A stored row naming a table the product no longer offers is DROPPED, not
 * surfaced.
 *
 * Surfaces get renamed and retired; a catalog row outliving its table would put
 * an unopenable tab in the strip. Reporting them separately lets a caller clean
 * up without the strip ever showing one.
 */
export function orphanedOrgTables(
  offered: readonly CatalogEntry[],
  stored: readonly OrgTableRow[],
): string[] {
  const known = new Set(offered.map((e) => e.tableId));
  return stored.filter((row) => !known.has(row.tableId)).map((row) => row.tableId);
}
