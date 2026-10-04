import type { CarrierCode } from './types';

/**
 * Single source of truth for which carriers we actively poll for tracking.
 * USPS stays off: OAuth v3 tokens work, but `/tracking/v3` answers 403 "MID is
 * not authorized" (Tracking API Access Controls, 2026-04-01) until USPS
 * approves our IP Agreement.
 */
export const ENABLED_SYNC_CARRIERS: readonly CarrierCode[] = ['UPS', 'FEDEX'];

/** Case-INSENSITIVE on purpose. */
export function isCarrierSyncEnabled(carrier: string | null | undefined): boolean {
  const token = String(carrier ?? '').trim().toUpperCase();
  return !!token && (ENABLED_SYNC_CARRIERS as readonly string[]).includes(token);
}
