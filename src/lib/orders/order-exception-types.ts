/**
 * Order-exception vocabulary — the PURE half of `order-exceptions.ts`.
 *
 * Dependency-free on purpose (types + constants + one pure derivation, and
 * `release-gates` which is itself pure). The query half reaches
 * `@/lib/tenancy/db` → `@/lib/db` → `server-only`, so a client component that
 * imported the blocker labels from there would pull the Neon driver into the
 * browser bundle and fail the build outright.
 *
 * Same bundle-altitude split the connectors use for
 * `orders-transfer-outcome.ts`: the SHAPE travels everywhere, the IO stays on
 * the server.
 */

import type { EvaluatedReleaseGates } from './release-gates';

/** One missing pairing fact, one control that fixes it. Paperwork (docs /
 * labels / tracking) is not an exception blocker — that walk is To-ship. */
export type OrderExceptionBlocker = 'unpaired' | 'no_item_number';

export const ORDER_EXCEPTION_BLOCKER_LABEL: Record<OrderExceptionBlocker, string> = {
  unpaired: 'Unpaired SKU',
  no_item_number: 'No item number',
};

export type OrderExceptionScope = 'actionable' | 'all';

export interface OrderExceptionRow {
  id: number;
  orderNumber: string | null;
  itemNumber: string | null;
  sku: string | null;
  productTitle: string | null;
  quantity: string | null;
  condition: string | null;
  accountSource: string | null;
  trackingNumber: string | null;
  releaseState: string | null;
  /** `sku_catalog.id` this order resolves to, or null when unpaired. */
  skuCatalogId: number | null;
  /** Title of the paired catalog entry — the "item display" being verified. */
  catalogTitle: string | null;
  catalogSku: string | null;
  /** Other UNPAIRED orders carrying this same item number. Pairing clears them too. */
  siblingUnpairedCount: number;
  blockers: OrderExceptionBlocker[];
  /** The release contract, unchanged — rendered, never re-derived. */
  gates: EvaluatedReleaseGates;
}

function present(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Derive the blocker list from an order's facts.
 *
 * Pure and exported so the rule is unit-testable without a database — the same
 * split that makes `evaluateReleaseGates` trustworthy.
 */
export function deriveOrderExceptionBlockers(facts: {
  itemNumber?: string | null;
  skuCatalogId?: number | null;
}): OrderExceptionBlocker[] {
  const blockers: OrderExceptionBlocker[] = [];
  // Pairing is the one the operator is here to clear. Since the 2026-08-31
  // flow ruling (R-FLOW-1) it corresponds to release gate G4; R-FLOW-7
  // (2026-09-01) narrowed this *queue* to pairing only — G2/G3 paperwork is
  // To-ship, not an exception blocker.
  if (facts.skuCatalogId == null) blockers.push('unpaired');
  if (!present(facts.itemNumber)) blockers.push('no_item_number');
  return blockers;
}

/**
 * How many held orders pairing this row's item number will clear — this order
 * plus {@link OrderExceptionRow.siblingUnpairedCount}.
 */
export function exceptionPairingResolveCount(
  row: Pick<OrderExceptionRow, 'siblingUnpairedCount'>,
): number {
  return 1 + Math.max(0, row.siblingUnpairedCount);
}

/**
 * Rail meta under the title: the pair-once fan-out the banner already names
 * (`siblingUnpairedCount`), else this order's quantity (Unbox-rail shape).
 */
export function exceptionRailMetaCount(
  row: Pick<OrderExceptionRow, 'siblingUnpairedCount' | 'quantity'>,
): string {
  const siblings = Math.max(0, row.siblingUnpairedCount);
  if (siblings > 0) return String(siblings);
  const n = Number(row.quantity);
  return String(Number.isFinite(n) && n > 0 ? n : 1);
}

/**
 * Worklist order: missing item numbers first (pairing cannot start), then
 * highest pair-once fan-out, then newer ids. Pins impact and urgency at the
 * top of the rail — not a "Resolves N" caption.
 */
export function compareExceptionQueueRows(
  a: Pick<OrderExceptionRow, 'id' | 'blockers' | 'siblingUnpairedCount'>,
  b: Pick<OrderExceptionRow, 'id' | 'blockers' | 'siblingUnpairedCount'>,
): number {
  const aNoItem = a.blockers.includes('no_item_number') ? 0 : 1;
  const bNoItem = b.blockers.includes('no_item_number') ? 0 : 1;
  if (aNoItem !== bNoItem) return aNoItem - bNoItem;
  const resolve = exceptionPairingResolveCount(b) - exceptionPairingResolveCount(a);
  if (resolve !== 0) return resolve;
  return b.id - a.id;
}

export function sortExceptionQueueRows<T extends Pick<OrderExceptionRow, 'id' | 'blockers' | 'siblingUnpairedCount'>>(
  rows: readonly T[],
): T[] {
  return [...rows].sort(compareExceptionQueueRows);
}
