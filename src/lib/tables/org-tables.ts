/** The per-org sheet catalog — which tables an organization runs, in what order. */

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

interface ResolvedCatalogEntry extends CatalogEntry {
  enabled: boolean;
  sortOrder: number;
  /** True when this org has recorded a decision; false = product default. */
  explicit: boolean;
}

/** Resolve the product's offering against one org's stored decisions. */
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

/** A stored row naming a table the product no longer offers is DROPPED, not surfaced. */
export function orphanedOrgTables(
  offered: readonly CatalogEntry[],
  stored: readonly OrgTableRow[],
): string[] {
  const known = new Set(offered.map((e) => e.tableId));
  return stored.filter((row) => !known.has(row.tableId)).map((row) => row.tableId);
}
