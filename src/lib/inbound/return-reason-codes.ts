/**
 * Marketplace return-reason codes → words an unboxer reads. Amazon's return
 * reports store a code (`CR-MISSING_PARTS`, `AMZ-PG-BAD-DESC`); hand-entered
 * returns store the form's own words (`INBOUND_RETURN_REASONS`), which pass
 * through untouched. The stored value is never rewritten — this is the one
 * reader every face uses to paint it.
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
