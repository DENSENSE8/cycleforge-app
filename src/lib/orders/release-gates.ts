/**
 * Release gates — the caged → released contract, as one pure function.
 *
 * Plan: `docs/todo/non-scan-desk-chrome-caged-release-PLAN.md` §4.2 (v1 locked).
 *
 * An order sits **CAGED** until every gate below is green; only then may staff
 * **RELEASE** it into the live To-ship working set. The three gates are the
 * operator's own sentence for "we know enough to work this":
 *
 * | # | Gate | Green when |
 * |---|---|---|
 * | G1 | Identity triangle | item number **and** order number **and** tracking number are all present and on the same record |
 * | G2 | Documents | ≥1 document linked to the item number, **or** staff asserted it needs none |
 * | G3 | Shipping | a label is linked to the order, **or** one was bought through the existing label path |
 *
 * ## Why this is a function and not a query
 *
 * Everything here is **derivation, not fetching**. The route gathers the facts
 * (one DB read), this decides. That split is what makes the rule testable
 * without a database and identical on the server that enforces it and the form
 * that previews it — a gate evaluated twice by two different code paths is a
 * gate that will eventually disagree with itself and release something caged.
 *
 * ## Failures are named, never silent
 *
 * The plan is explicit: "UI must show which gate failed (not a silent disabled
 * button)". So this returns the whole evaluation — every gate with its own
 * pass/fail and a plain-language reason — and the caller renders the list. A
 * bare boolean would push the UI back into re-deriving *why*, which is the
 * duplicate-rule problem again.
 *
 * Org-authored gate types are explicitly out of v1: the gates are product-coded
 * here and nowhere else.
 */

/** Gate ids, in the order they are presented to the operator. */
export const RELEASE_GATE_IDS = ['G1', 'G2', 'G3'] as const;
export type ReleaseGateId = (typeof RELEASE_GATE_IDS)[number];

export const RELEASE_GATE_LABEL: Record<ReleaseGateId, string> = {
  G1: 'Identity triangle',
  G2: 'Documents',
  G3: 'Shipping label',
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

/**
 * Evaluate G1–G3 against a snapshot of an order's facts.
 *
 * Pure: same facts in, same verdict out, no clock and no I/O. Unknown facts are
 * treated as ABSENT (a gate is green only on positive evidence) — the cage
 * exists to stop half-known orders reaching the floor, so "we did not look" and
 * "it is not there" must land on the same side.
 */
export function evaluateReleaseGates(facts: ReleaseGateFacts): EvaluatedReleaseGates {
  const hasOrderNumber = present(facts.orderNumber);
  const hasItemNumber = present(facts.itemNumber);
  const hasTracking = present(facts.trackingNumber);

  const g1Missing: string[] = [];
  if (!hasItemNumber) g1Missing.push('item number');
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
      passed: labelLinked || labelPurchased,
      reason:
        labelLinked || labelPurchased
          ? null
          : 'Link an existing shipping label, or buy one.',
    },
  ];

  const failing = gates.filter((gate) => !gate.passed);
  return { canRelease: failing.length === 0, gates, failing };
}

/** Wire/DB state. NULL reads as released — see the migration's header. */
export type OrderReleaseState = 'caged' | 'released';

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
