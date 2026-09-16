import type { CarrierCode } from './types';

/**
 * Single source of truth for which carriers we actively poll for tracking.
 *
 * USPS is currently DISABLED — we're still waiting on OAuth credentials from
 * USPS, so any USPS Track call would just 401. Keeping it out of this set means
 * the cron sweeps (`getDueShipments`) never select USPS rows and any manual
 * refresh (`syncShipment`) skips USPS gracefully instead of erroring.
 *
 * To re-enable once USPS OAuth is provisioned: add 'USPS' back to the array.
 */
export const ENABLED_SYNC_CARRIERS: readonly CarrierCode[] = ['UPS', 'FEDEX'];

/**
 * Case-INSENSITIVE on purpose. The column is uppercase by constraint
 * (2026-09-13 migration), but seven INSERT sites supply `carrier` themselves
 * and one lane row reached production as lowercase `usps`. A case-sensitive
 * gate skips such a row forever, silently: no poll, no status, no error, and
 * nothing on any desk says why. Compare the token, not the spelling.
 */
export function isCarrierSyncEnabled(carrier: string | null | undefined): boolean {
  const token = String(carrier ?? '').trim().toUpperCase();
  return !!token && (ENABLED_SYNC_CARRIERS as readonly string[]).includes(token);
}
