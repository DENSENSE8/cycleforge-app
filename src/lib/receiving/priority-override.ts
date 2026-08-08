/**
 * Source of truth for the *manual* priority-tier override (receiving.priority_tier).
 *
 * Distinct from the platform-derived rank computed server-side in
 * RECEIVING_PRIORITY_RANK_SQL. This module owns the small set of
 * tiers an operator can explicitly pick from the urgency pill, plus the tones
 * the pill renders. `null` priority_tier = Auto (no override → the platform-
 * derived rank applies). A set value (0..3) wins over the platform rank in
 * RECEIVING_PRIORITY_RANK_SQL (`COALESCE(priority_tier, <platform CASE>)`).
 *
 * Pure + dependency-free so any client surface can import it.
 */

export interface PriorityOverrideTier {
  /** Stored receiving.priority_tier value. Lower = higher up the sort. */
  value: number;
  /** Pill option + full collapsed-display label (Classify / tooltips). */
  label: string;
  /** Dense carton-bookmark label (≤4 chars preferred). */
  short: string;
  title: string;
  /**
   * Quiet flat tint when this tier is the active/effective selection — same
   * face language as Claim/Photos (`border-*-200 bg-*-50 text-*-700 shadow-none`).
   */
  activeClass: string;
  /** Tinted tone in the expanded option list. */
  inactiveClass: string;
}

/**
 * Manually-selectable tiers, most urgent first (storage / filter / facet order).
 * Tones mirror platform-derived urgency words (red → amber → blue → emerald).
 *
 * **Picker lists** (Classify · Add Inbound) put Auto/platform first, then escalate
 * via {@link priorityOverrideTiersForPicker} so Priority is last — default heat
 * comes from platform/org unbox policy (e.g. Amazon → High), not a manual pin.
 */
export const PRIORITY_OVERRIDE_TIERS: readonly PriorityOverrideTier[] = [
  {
    value: 0,
    label: 'Priority',
    short: 'Pri',
    title: 'Manual top priority — unbox / test first',
    activeClass: 'border-red-200 bg-red-50 text-red-700 shadow-none',
    inactiveClass: 'border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100',
  },
  {
    value: 1,
    label: 'High',
    short: 'High',
    title: 'Manual high priority',
    activeClass: 'border-amber-200 bg-amber-50 text-amber-700 shadow-none',
    inactiveClass: 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:bg-amber-100',
  },
  {
    value: 2,
    label: 'Medium',
    short: 'Med',
    title: 'Manual medium priority',
    activeClass: 'border-blue-200 bg-blue-50 text-blue-700 shadow-none',
    inactiveClass: 'border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300 hover:bg-blue-100',
  },
  {
    value: 3,
    label: 'Low',
    short: 'Low',
    title: 'Manual low priority',
    activeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-none',
    inactiveClass: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100',
  },
];

/**
 * Manual tiers for urgency comboboxes / pill lists under Auto: Low → Medium →
 * High → Priority (escalate toward the bottom).
 */
export function priorityOverrideTiersForPicker(): readonly PriorityOverrideTier[] {
  return PRIORITY_OVERRIDE_TIERS_PICKER;
}

const PRIORITY_OVERRIDE_TIERS_PICKER: readonly PriorityOverrideTier[] = [
  ...PRIORITY_OVERRIDE_TIERS,
].reverse();

const BY_VALUE = new Map(PRIORITY_OVERRIDE_TIERS.map((t) => [t.value, t]));

/** Resolve a stored priority_tier to its tier meta. `null`/unknown → null (Auto). */
export function priorityOverrideTier(value: number | null | undefined): PriorityOverrideTier | null {
  if (value == null) return null;
  return BY_VALUE.get(value) ?? null;
}

/** Lowest/highest values are valid stored tiers; used to validate API input. */
export function isValidPriorityTier(value: number | null | undefined): boolean {
  return value == null || BY_VALUE.has(value);
}
