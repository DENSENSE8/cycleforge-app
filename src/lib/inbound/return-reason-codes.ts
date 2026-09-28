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
  // Carton-level fallbacks carry the RMA after ` · ` (`tagInboundAsReturn`).
  const [head, ...rest] = value.split(' · ');
  const tail = rest.length ? ` · ${rest.join(' · ')}` : '';
  const code = head.trim();
  if (!CODE_SHAPE.test(code) || !/[_-]/.test(code)) return { label: value, code: null };
  const label = RETURN_REASON_CODE_LABELS[code.replace(/^(?:CR|AMZ-PG)-/, '').replace(/-/g, '_')];
  return { label: `${label ?? code}${tail}`, code: label ? code : null };
}
