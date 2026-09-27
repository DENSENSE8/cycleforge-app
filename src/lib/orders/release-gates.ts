/**
 * Release gates — the caged → released contract, as one pure function.
 * ## Why pairing became a gate (operator ruling 2026-08-31, R-FLOW-1)
 * ## Why a tracking number satisfies G3 (operator ruling 2026-08-31)
 */

/** Gate ids, in the order they are presented to the operator. */
const RELEASE_GATE_IDS = ['G1', 'G2', 'G3', 'G4'] as const;
export type ReleaseGateId = (typeof RELEASE_GATE_IDS)[number];

const RELEASE_GATE_LABEL: Record<ReleaseGateId, string> = {
  G1: 'Identity triangle',
  G2: 'Documents',
  G3: 'Shipping label',
  G4: 'SKU pairing',
};

/**
 * The facts a gate evaluation needs. Deliberately flat and primitive — the
 * caller shapes its row into this, so the rule never learns the DB's column
 * names or the wire payload's casing.
 */
export interface ReleaseGateFacts {
  /** `orders.order_id` — the marketplace / manual order number. */
  orderNumber?: string | null;
  /** `orders.item_number`. */
  itemNumber?: string | null;
  /** Carrier tracking, resolved through `orders.shipment_id`. */
  trackingNumber?: string | null;
  /** How many documents are linked to this order's item (or the order itself). */
  linkedDocumentCount?: number | null;
  /** `orders.docs_not_required` — the explicit G2 exemption. */
  docsNotRequired?: boolean | null;
  /** A shipping-label document is linked to this order. */
  shippingLabelLinked?: boolean | null;
  /** A label was purchased through the existing buy path. */
  shippingLabelPurchased?: boolean | null;
  /**
   * `orders.sku_catalog_id` — the pairing to the inventory SoT. Absent/null
   * reads as unpaired (G4 red), same absence-is-failure posture as the rest.
   */
  skuCatalogId?: number | null;
}

export interface EvaluatedReleaseGate {
  id: ReleaseGateId;
  label: string;
  passed: boolean;
  /** Why it is not green yet. `null` once it passes. */
  reason: string | null;
}

export interface EvaluatedReleaseGates {
  /** True only when every gate passed. The one thing Release may key off. */
  canRelease: boolean;
  gates: EvaluatedReleaseGate[];
  /** Just the failures, for a terse "blocked by" line. */
  failing: EvaluatedReleaseGate[];
}

/** Present = a non-blank string. `'  '` is absence with extra steps. */
function present(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Evaluate G1–G3 against a snapshot of an order's facts. */
export function evaluateReleaseGates(facts: ReleaseGateFacts): EvaluatedReleaseGates {
  const hasOrderNumber = present(facts.orderNumber);
  const hasTracking = present(facts.trackingNumber);
  const paired =
    typeof facts.skuCatalogId === 'number' && Number.isFinite(facts.skuCatalogId);
  // The product half of the triangle: a listing's item number, or — for an
  // order with no listing (phone, walk-in) — the catalog SKU it is paired to.
  const hasProduct = present(facts.itemNumber) || paired;

  const g1Missing: string[] = [];
  if (!hasProduct) g1Missing.push('item number (or a catalog SKU)');
  if (!hasOrderNumber) g1Missing.push('order number');
  if (!hasTracking) g1Missing.push('tracking number');

  const docCount = Number(facts.linkedDocumentCount ?? 0);
  const docsExempt = facts.docsNotRequired === true;
  const hasDocs = Number.isFinite(docCount) && docCount > 0;

  const labelLinked = facts.shippingLabelLinked === true;
  const labelPurchased = facts.shippingLabelPurchased === true;

  const gates: EvaluatedReleaseGate[] = [
    {
      id: 'G1',
      label: RELEASE_GATE_LABEL.G1,
      passed: g1Missing.length === 0,
      reason:
        g1Missing.length === 0
          ? null
          : `Link the ${g1Missing.join(', ')} to this order.`,
    },
    {
      id: 'G2',
      label: RELEASE_GATE_LABEL.G2,
      passed: hasDocs || docsExempt,
      reason:
        hasDocs || docsExempt
          ? null
          : 'Link a manual or paperwork to the item number, or mark that it does not require documents.',
    },
    {
      id: 'G3',
      label: RELEASE_GATE_LABEL.G3,
      // `hasTracking` is the operator's ruling, not a shortcut: a linked
      // tracking number IS the label as far as this floor is concerned.
      passed: labelLinked || labelPurchased || hasTracking,
      reason:
        labelLinked || labelPurchased || hasTracking
          ? null
          : 'Link a tracking number or an existing shipping label, or buy one.',
    },
    {
      id: 'G4',
      label: RELEASE_GATE_LABEL.G4,
      passed: paired,
      reason: paired
        ? null
        : 'Pair the item number to a catalog SKU (the Zoho inventory record).',
    },
  ];

  const failing = gates.filter((gate) => !gate.passed);
  return { canRelease: failing.length === 0, gates, failing };
}

/** Wire/DB state. NULL reads as released — see the migration's header. */
type OrderReleaseState = 'caged' | 'released';

/**
 * Is this order in the live working set?
 *
 * NULL / unknown → **released**. Every order that predates the cage is real
 * working stock, and a default of "caged" would empty the queue.
 */
export function isReleased(state: string | null | undefined): boolean {
  return String(state || '').trim().toLowerCase() !== 'caged';
}

export function isCaged(state: string | null | undefined): boolean {
  return !isReleased(state);
}
