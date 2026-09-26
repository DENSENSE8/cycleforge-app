/** The words a staff PIN step-up offers on a counter line's price. */

/** Square-style preset reasons for a price adjustment; free text is always allowed too. */
export const PRICE_ADJUST_REASONS = ['Price match', 'Damaged box', 'Goodwill', 'Re-quote'] as const;

/**
 * Comp reasons when the org has not set its own (`OrgSettings.kiosk.compReasons`,
 * Settings → Organization). Square ships the same idea: a short, owner-editable list.
 */
export const DEFAULT_COMP_REASONS = ['Goodwill', 'Customer complaint', 'Staff', 'Promotion'] as const;

export interface KioskLineReasons {
  comp: readonly string[];
}

export const DEFAULT_LINE_REASONS: KioskLineReasons = {
  comp: DEFAULT_COMP_REASONS,
};
