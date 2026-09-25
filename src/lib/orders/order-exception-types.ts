/**
 * Order-exception vocabulary — the PURE half of `order-exceptions.ts`.
 *
 * Dependency-free on purpose (types + constants + one pure derivation, and
 * `release-gates` which is itself pure). The query half reaches
 * `@/lib/tenancy/db` → `@/lib/db` → `server-only`, so a client component that
 * imported the blocker labels from there would pull the Neon driver into the
 * browser bundle and fail the build outright.
 *
 * Bundle-altitude split: the SHAPE travels everywhere, the IO stays on the
 * server.
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

/**
 * Typed management contract for exceptions currently admitted to this queue.
 * New exception sources must add an explicit mapping here; renderers never
 * infer a category, action, or owner from a free-text blocker label.
 */
export interface OrderExceptionRouting {
  category: 'SKU mapping';
  actionRequired: 'Add item number' | 'Pair SKU';
  owner: 'Inventory';
}

export function resolveOrderExceptionRouting(
  blockers: readonly OrderExceptionBlocker[],
): OrderExceptionRouting {
  return blockers.includes('no_item_number')
    ? { category: 'SKU mapping', actionRequired: 'Add item number', owner: 'Inventory' }
    : { category: 'SKU mapping', actionRequired: 'Pair SKU', owner: 'Inventory' };
}

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
  /** Typed category, required action, and accountable team. */
  routing: OrderExceptionRouting;
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

function exceptionItemKey(itemNumber: string | null | undefined): string {
  return (itemNumber ?? '').trim().toLowerCase();
}

/**
 * Recents rail grain: one row per item number. Pairing is pair-once, so five
 * orders of B0D6X2MFSZ are one walk item. Orders with no item number stay
 * uncollapsed — each is its own pairing problem. When `selectedId` is a
 * sibling of a kept row, that sibling is the representative so the rail
 * highlight stays on the open record.
 */
export function collapseExceptionRailByItem<
  T extends Pick<OrderExceptionRow, 'id' | 'itemNumber' | 'blockers' | 'siblingUnpairedCount'>,
>(rows: readonly T[], selectedId: number | null = null): T[] {
  const sorted = sortExceptionQueueRows(rows);
  const preferred = new Map<string, T>();
  if (selectedId != null) {
    const selected = sorted.find((row) => row.id === selectedId);
    const key = selected ? exceptionItemKey(selected.itemNumber) : '';
    if (selected && key) preferred.set(key, selected);
  }
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of sorted) {
    const key = exceptionItemKey(row.itemNumber);
    if (!key) {
      out.push(row);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(preferred.get(key) ?? row);
  }
  return out;
}
