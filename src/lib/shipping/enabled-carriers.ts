import type { CarrierCode } from './types';

/** Single source of truth for which carriers we actively poll for tracking. */
export const ENABLED_SYNC_CARRIERS: readonly CarrierCode[] = ['UPS', 'FEDEX'];

/** Case-INSENSITIVE on purpose. */
export function isCarrierSyncEnabled(carrier: string | null | undefined): boolean {
  const token = String(carrier ?? '').trim().toUpperCase();
  return !!token && (ENABLED_SYNC_CARRIERS as readonly string[]).includes(token);
}
