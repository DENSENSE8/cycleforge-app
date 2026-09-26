/** Order-exception vocabulary — the PURE half of `order-exceptions.ts`. */

import type { EvaluatedReleaseGates } from './release-gates';

/** Categories the parent Exceptions desk can filter without hiding the work owner. */
export const ORDER_EXCEPTION_CATEGORIES = [
  'SKU Mapping',
  'Out of Stock',
  'Address Issue',
  'Buyer Request',
  'Marketplace Hold',
  'Testing Issue',
  'Shipping Issue',
  'Other',
] as const;

export type OrderExceptionCategory = (typeof ORDER_EXCEPTION_CATEGORIES)[number];

/** One missing pairing fact, one control that fixes it. Paperwork (docs /
 * labels / tracking) is not an exception blocker — that walk is To-ship. */
export type OrderExceptionBlocker = 'unpaired' | 'no_item_number';

export const ORDER_EXCEPTION_BLOCKER_LABEL: Record<OrderExceptionBlocker, string> = {
  unpaired: 'Unpaired SKU',
  no_item_number: 'No item number',
};

export type OrderExceptionScope = 'actionable' | 'all';

/**
 * Typed management contract for one exception. Categories are explicit so a
 * renderer cannot turn a free-text blocker into an invented owner or action.
 */
export interface OrderExceptionRouting {
  category: OrderExceptionCategory;
  actionRequired: string;
  owner: string;
}

export function resolveOrderExceptionRouting(
  blockers: readonly OrderExceptionBlocker[],
  facts: { category?: OrderExceptionCategory | null } = {},
): OrderExceptionRouting {
  const category = facts.category;
  if (category && category !== 'Other' && category !== 'SKU Mapping') {
    const defaults: Record<
      Exclude<OrderExceptionCategory, 'SKU Mapping' | 'Other'>,
      { actionRequired: string; owner: string }
    > = {
      'Out of Stock': { actionRequired: 'Replenish or approve a substitute', owner: 'Inventory' },
      'Address Issue': { actionRequired: 'Verify the ship-to address', owner: 'Customer Service' },
      'Buyer Request': { actionRequired: 'Review and acknowledge the buyer instruction', owner: 'Customer Service' },
      'Marketplace Hold': { actionRequired: 'Review the marketplace hold', owner: 'Marketplace Operations' },
      'Testing Issue': { actionRequired: 'Complete or correct the test', owner: 'Testing' },
      'Shipping Issue': { actionRequired: 'Resolve the carrier or label issue', owner: 'Shipping' },
    };
    return { category, ...defaults[category] };
  }
  if (category === 'SKU Mapping') {
    return {
      category,
      actionRequired: 'Report to Inventory / Accounting for controlled review',
      owner: 'Inventory / Accounting',
    };
  }
  if (blockers.includes('no_item_number')) {
    return { category: 'SKU Mapping', actionRequired: 'Add item number', owner: 'Inventory / Accounting' };
  }
  if (blockers.includes('unpaired')) {
    return { category: 'SKU Mapping', actionRequired: 'Pair to an existing inventory item', owner: 'Inventory / Accounting' };
  }
  return { category: facts.category ?? 'Other', actionRequired: 'Review and assign the next action', owner: 'Operations' };
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
  /** Assigned person, when the active work assignment names one. */
  responsiblePerson: string | null;
  /** Notes that must remain visible while the exception is worked. */
  buyerNote: string | null;
  internalNote: string | null;
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
  // Pairing is the one the operator is here to clear.
  // Pairing is the one the operator is here to clear. Since the 2026-08-31
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

/** Recents rail grain: */
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
