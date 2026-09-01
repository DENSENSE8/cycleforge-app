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

/** One missing fact, one control that fixes it. */
export type OrderExceptionBlocker =
  | 'unpaired'
  | 'no_item_number'
  | 'no_tracking'
  | 'no_docs'
  | 'no_label';

export const ORDER_EXCEPTION_BLOCKER_LABEL: Record<OrderExceptionBlocker, string> = {
  unpaired: 'Unpaired SKU',
  no_item_number: 'No item number',
  no_tracking: 'No tracking',
  no_docs: 'No documents',
  no_label: 'No label',
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
  trackingNumber?: string | null;
  skuCatalogId?: number | null;
  linkedDocumentCount?: number | null;
  docsNotRequired?: boolean | null;
  shippingLabelLinked?: boolean | null;
  shippingLabelPurchased?: boolean | null;
}): OrderExceptionBlocker[] {
  const blockers: OrderExceptionBlocker[] = [];
  // Pairing first: it is the one the operator is here to clear, and since the
  // 2026-08-31 flow ruling (R-FLOW-1) it corresponds to release gate G4 —
  // `unpaired` here and G4 in `release-gates.ts` must agree, same as the
  // tracking↔label coupling below.
  if (facts.skuCatalogId == null) blockers.push('unpaired');
  if (!present(facts.itemNumber)) blockers.push('no_item_number');
  if (!present(facts.trackingNumber)) blockers.push('no_tracking');
  const docCount = Number(facts.linkedDocumentCount ?? 0);
  if (!(docCount > 0) && facts.docsNotRequired !== true) blockers.push('no_docs');
  // A linked tracking number counts as the label (operator ruling 2026-08-31),
  // exactly as it does for G3 in `release-gates.ts` — the two must agree or a
  // row would print a `no_label` chip the Release control does not honour.
  if (
    facts.shippingLabelLinked !== true
    && facts.shippingLabelPurchased !== true
    && !present(facts.trackingNumber)
  ) {
    blockers.push('no_label');
  }
  return blockers;
}
