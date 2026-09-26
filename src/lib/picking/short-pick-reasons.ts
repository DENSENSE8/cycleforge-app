/** Short-pick reason-code vocabulary — the built-in SoT for WHY a picker confirmed fewer units than planned (the remainder is released back… */

interface ShortPickReasonOption {
  code: string;
  label: string;
  hint: string;
}

export const SHORT_PICK_REASONS: readonly ShortPickReasonOption[] = [
  { code: 'NOT_FOUND_IN_BIN', label: 'Not in bin', hint: 'Expected here, not present' },
  { code: 'DAMAGED', label: 'Damaged', hint: 'Visible damage — needs hold' },
  { code: 'WRONG_CONDITION', label: 'Wrong condition', hint: "Grade doesn't match order" },
  { code: 'MISLABELED', label: 'Mislabeled', hint: 'SKU on unit ≠ bin label' },
  { code: 'INSUFFICIENT_STOCK', label: 'Insufficient stock', hint: 'Fewer units exist than planned' },
  { code: 'OTHER', label: 'Other', hint: 'Add a note below' },
];

const BY_CODE = new Map(SHORT_PICK_REASONS.map((r) => [r.code, r]));

/**
 * Map tenant-stored short-pick rows (DB owns code + label) into the option shape
 * the sheet renders, resolving the built-in `hint` by code (blank for custom).
 */
export function mergeShortPickReasons(
  rows: readonly { code: string; label: string }[],
): ShortPickReasonOption[] {
  return rows.map((r) => ({ code: r.code, label: r.label, hint: BY_CODE.get(r.code)?.hint ?? '' }));
}
