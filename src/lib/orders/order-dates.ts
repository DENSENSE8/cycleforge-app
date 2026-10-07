/**
 * The two dates every order carries, and the only words for them.
 *
 * - **Placed** — when the buyer placed the order, as the channel states it
 *   (`orders.order_date`). Null when no channel told us.
 * - **Imported** — when CycleForge first wrote the row (`orders.created_at`).
 *   Never null.
 *
 * A reader that needs an instant for EVERY order (sorting, aging, a day
 * filter over all orders) uses {@link placedElseImportedSql} /
 * {@link placedElseImported} — named, so the call site says it falls back —
 * never a bare `COALESCE(order_date, created_at)`. A reader that means only
 * one of the two reads that column and labels it with {@link ORDER_DATE_LABEL}.
 */

export const ORDER_DATE_LABEL = { placed: 'Placed', imported: 'Imported' } as const;

/** SQL: Placed, else Imported, for the `orders` row aliased `alias`. */
export function placedElseImportedSql(alias: string): string {
  return `COALESCE(${alias}.order_date, ${alias}.created_at)`;
}

/** Placed, else Imported, for a row read from `orders`; null only when both are missing. */
export function placedElseImported<T extends Date | string>(row: {
  order_date?: T | null;
  created_at?: T | null;
}): T | null {
  return row.order_date ?? row.created_at ?? null;
}
