/** Seller-claimed listing condition — the QC reference fact for Testing. */

export type SellerClaimedConditionSource = 'order' | 'listing';

export interface SellerClaimedCondition {
  /** Operator-facing label, or null when unknown. */
  label: string | null;
  source: SellerClaimedConditionSource | null;
  /** Raw stored value before pretty-print (for claim prefill). */
  raw: string | null;
}

function prettyEnum(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Prefer the sold-as order condition (what the buyer was told), then a listing
 * catalog condition. Never invent a grade from warehouse `condition_grade`.
 */
export function resolveSellerClaimedCondition(input: {
  /** Matched outbound / return order `condition` (sold-as). */
  matchedOrderCondition?: string | null;
  /** `platform_listings.listing_condition` when linked. */
  listingCondition?: string | null;
}): SellerClaimedCondition {
  const order = String(input.matchedOrderCondition ?? '').trim();
  if (order) {
    return { label: prettyEnum(order), source: 'order', raw: order };
  }
  const listing = String(input.listingCondition ?? '').trim();
  if (listing) {
    return { label: prettyEnum(listing), source: 'listing', raw: listing };
  }
  return { label: null, source: null, raw: null };
}

/** Claim / seller-message issue line when QC says not as listed. */
export function buildNotAsListedIssue(input: {
  claimed: SellerClaimedCondition;
  /** Optional free-text operator note of the exact defect. */
  issueDetail?: string | null;
}): string {
  const detail = String(input.issueDetail ?? '').trim();
  const claimedBit = input.claimed.label
    ? `Listed / sold as ${input.claimed.label}`
    : 'Does not match the listing claim';
  if (detail) return `${claimedBit}. Issue: ${detail}`;
  return `${claimedBit}. Unit does not work as listed.`;
}

/**
 * Order # hint for return-intake lines only. Zoho PO numbers on purchase
 * cartons are not sold-as marketplace claims — skip those.
 */
export function orderIdHintForSellerClaim(row: {
  receiving_type?: string | null;
  carton_intake_type?: string | null;
  intake_type?: string | null;
  source_order_id?: string | null;
  zoho_purchaseorder_number?: string | null;
}): string | null {
  const type = String(
    row.receiving_type || row.carton_intake_type || row.intake_type || '',
  )
    .trim()
    .toUpperCase()
    .replace(/-/g, '_');
  const isReturn = type === 'RETURN' || type === 'RETURNS';
  if (!isReturn) return null;
  const source = String(row.source_order_id ?? '').trim();
  if (source) return source;
  const poFace = String(row.zoho_purchaseorder_number ?? '').trim();
  return poFace || null;
}
