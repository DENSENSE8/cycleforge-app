/**
 * The verbs a staff PIN authorizes on a counter line. Pure (no `node:crypto`)
 * so the tablet can name them; signing lives in `price-approval.ts`.
 */

import { PRICE_ADJUST_KINDS } from '@/lib/counter/counter-transaction-types';

/** `void` removes a line; the rest re-price it. */
export const PRICE_APPROVAL_KINDS = [...PRICE_ADJUST_KINDS, 'void'] as const;
export type PriceApprovalKind = (typeof PRICE_APPROVAL_KINDS)[number];

/** Square-style preset reasons for a price adjustment; free text is always allowed too. */
export const PRICE_ADJUST_REASONS = ['Price match', 'Damaged box', 'Goodwill', 'Re-quote'] as const;

/**
 * Comp and void reasons when the org has not set its own
 * (`OrgSettings.kiosk.compReasons` / `voidReasons`, Settings → Organization).
 * Square ships the same idea: a short, owner-editable list.
 */
export const DEFAULT_COMP_REASONS = ['Goodwill', 'Customer complaint', 'Staff', 'Promotion'] as const;
export const DEFAULT_VOID_REASONS = [
  'Customer changed mind',
  'Rang up by mistake',
  'Out of stock',
  'Damaged',
] as const;

export interface KioskLineReasons {
  comp: readonly string[];
  void: readonly string[];
}

export const DEFAULT_LINE_REASONS: KioskLineReasons = {
  comp: DEFAULT_COMP_REASONS,
  void: DEFAULT_VOID_REASONS,
};