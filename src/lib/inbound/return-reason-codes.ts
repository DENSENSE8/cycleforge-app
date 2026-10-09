/**
 * Marketplace return-reason codes → words an unboxer reads. Amazon's return
 * reports store a code (`CR-MISSING_PARTS`, `AMZ-PG-BAD-DESC`); eBay returns
 * store the Post-Order `ReturnReasonEnum` value (`NO_LONGER_NEED_ITEM`);
 * hand-entered returns store the form's own words (`INBOUND_RETURN_REASONS`),
 * which pass through untouched. The stored value is never rewritten — this is
 * the one reader every face uses to paint it.
 */

/** Keyed by the code with its `CR-` / `AMZ-PG-` prefix stripped, `-` → `_`. */
const RETURN_REASON_CODE_LABELS: Readonly<Record<string, string>> = {
  DEFECTIVE: "Defective / doesn't work",
  QUALITY_UNACCEPTABLE: 'Quality not acceptable',
  DAMAGED_BY_FC: 'Damaged in the Amazon warehouse',
  DAMAGED_BY_CARRIER: 'Damaged in transit',
  MISSING_PARTS: 'Missing parts / accessories',
  NOT_COMPATIBLE: 'Not compatible with the buyer’s device',
  NOT_AS_DESCRIBED: 'Not as described',
  BAD_DESC: 'Not as described',
  SWITCHEROO: 'Wrong item sent',
  EXTRA_ITEM: 'Extra item included',
  ORDERED_WRONG_ITEM: 'Buyer ordered the wrong item',
  MISORDERED: 'Buyer ordered the wrong item',
  UNWANTED_ITEM: 'Changed mind / no longer needed',
  FOUND_BETTER_PRICE: 'Found a better price',
  MISSED_ESTIMATED_DELIVERY: 'Arrived too late',
  UNAUTHORIZED_PURCHASE: 'Unauthorized purchase',
  POOR_FIT: 'Poor fit',
  APPAREL_TOO_SMALL: 'Too small',
  APPAREL_TOO_LARGE: 'Too large',
  // FBA customer returns report (`reason`).
  CUSTOMER_DAMAGED: 'Damaged by the buyer',
  NO_REASON_GIVEN: 'No reason given',
  UNDELIVERABLE_REFUSED: 'Refused at delivery',
  UNDELIVERABLE_UNKNOWN: 'Undeliverable',
  // eBay Post-Order ReturnReasonEnum (`creationInfo.reason`); MISSING_PARTS, NOT_AS_DESCRIBED,
  // ORDERED_WRONG_ITEM and FOUND_BETTER_PRICE share Amazon's words above.
  ARRIVED_DAMAGED: 'Arrived damaged',
  ARRIVED_LATE: 'Arrived too late',
  DEFECTIVE_ITEM: "Defective / doesn't work",
  DIFFERENT_FROM_LISTING: 'Different from the listing',
  DOES_NOT_FIT: 'Doesn’t fit the buyer’s vehicle',
  WRONG_SIZE: 'Wrong size',
  NO_LONGER_NEED_ITEM: 'Changed mind / no longer needed',
  ORDERED_ACCIDENTALLY: 'Ordered by mistake',
  ORDERED_DIFFERENT_ITEM: 'Wrong item sent',
  RETURNING_GIFT: 'Unwanted gift',
  EXPIRED_ITEM: 'Past its expiration date',
  FAKE_OR_COUNTERFEIT: 'Suspected counterfeit',
  CUSTOMIZED: 'Customized — failed authentication',
  MISCATEGORIZED: 'Miscategorized — failed authentication',
  IN_STORE_RETURN: 'Returned in store',
  WITHDRAW_FROM_PURCHASE_CONTRACT: 'Withdrew from the purchase (EU)',
  NO_REASON: 'No reason given',
  OTHER: 'Other',
  // Deprecated by eBay; still on historical returns.
  BUYER_CANCEL_ORDER: 'Buyer cancelled the order',
  BUYER_NO_SHOW: 'Buyer did not show for pickup',
  BUYER_NOT_SCHEDULED: 'Buyer did not schedule pickup',
  BUYER_REFUSED_TO_PICKUP: 'Buyer refused pickup',
  OUT_OF_STOCK: 'Out of stock',
  VALET_DELIVERY_ISSUES: 'Valet delivery problem',
  VALET_UNAVAILABLE: 'Valet unavailable',
};

const CODE_SHAPE = /^[A-Z0-9]+(?:[-_][A-Z0-9]+)*$/;

/**
 * How a stored return reason reads. `code` is the marketplace code when the
 * value was one (shown beside the words so the unboxer can match the report);
 * free text and the form's own reasons come back as-is with `code: null`. An
 * unknown code keeps its code as the label — never a guessed meaning.
 */
export function readReturnReason(raw: string | null | undefined): { label: string; code: string | null } | null {
  const value = raw?.trim();
  if (!value) return null;
  // Carton-level fallbacks carry the RMA after ` · ` (`tagInboundReturnInTx`).
  const [head, ...rest] = value.split(' · ');
  const tail = rest.length ? ` · ${rest.join(' · ')}` : '';
  const code = head.trim();
  const label = CODE_SHAPE.test(code) ? RETURN_REASON_CODE_LABELS[code.replace(/^(?:CR|AMZ-PG)-/, '').replace(/-/g, '_')] : undefined;
  // A bare word (FBA's `DEFECTIVE`) is a code only when it is a known one; anything else is free text.
  if (!CODE_SHAPE.test(code) || (!/[_-]/.test(code) && !label)) return { label: value, code: null };
  return { label: `${label ?? code}${tail}`, code: label ? code : null };
}
