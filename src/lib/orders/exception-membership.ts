/**
 * Exception membership — unpaired catalog pairing, not paperwork.
 * Operator 2026-09-01: the exceptions desk pairs an item number to the Zoho
 */

const SQL_ALIAS = /^[A-Za-z_][A-Za-z0-9_]*$/;

function col(alias: string | undefined, name: string): string {
  if (alias == null || alias === '') return name;
  if (!SQL_ALIAS.test(alias)) {
    throw new Error(`exception-membership: invalid SQL alias ${JSON.stringify(alias)}`);
  }
  return `${alias}.${name}`;
}

/**
 * Held for catalog pairing. Pass the table alias used in the surrounding
 * query (`o`, `orders`, …); omit it for an unqualified `FROM orders`.
 */
export function exceptionHeldSql(alias?: string): string {
  const releaseState = col(alias, 'release_state');
  const skuCatalogId = col(alias, 'sku_catalog_id');
  return `(COALESCE(${releaseState}, '') = 'caged' AND ${skuCatalogId} IS NULL)`;
}

/** Live To-ship / pack working set — the negation of {@link exceptionHeldSql}. */
export function liveWorkingSetSql(alias?: string): string {
  return `NOT ${exceptionHeldSql(alias)}`;
}

/** Pure twin of the SQL — unit-tested without a database. */
export function isExceptionHeld(facts: {
  releaseState?: string | null;
  skuCatalogId?: number | null;
}): boolean {
  const caged = String(facts.releaseState ?? '').trim() === 'caged';
  return caged && facts.skuCatalogId == null;
}
