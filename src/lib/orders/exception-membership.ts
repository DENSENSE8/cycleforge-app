import { buyerNoteUnacknowledgedSql } from './buyer-note-interlock';

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

/**
 * Order-exceptions desk queue membership (`actionable` scope) — the ONE
 * predicate the desk list, its sidebar count and identify's stage read.
 * Expects the order alias and its `shipping_tracking_numbers` join alias. A
 * buyer note holds the order only until someone acknowledges it
 * (`buyerNoteUnacknowledgedSql`, the pack / label interlock's own test).
 */
export function sqlOrderInExceptionQueue(orderAlias = 'o', stnAlias = 'stn'): string {
  return `(
      ${exceptionHeldSql(orderAlias)}
      OR ${col(orderAlias, 'is_out_of_stock')}
      OR ${buyerNoteUnacknowledgedSql(orderAlias)}
      OR COALESCE(${col(stnAlias, 'has_exception')}, false)
    )`;
}

/** Pure twin of the SQL — unit-tested without a database. */
export function isExceptionHeld(facts: {
  releaseState?: string | null;
  skuCatalogId?: number | null;
}): boolean {
  const caged = String(facts.releaseState ?? '').trim() === 'caged';
  return caged && facts.skuCatalogId == null;
}
