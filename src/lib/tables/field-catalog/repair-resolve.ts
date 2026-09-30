/** Repair row facts — the shared value readers the record view and card model paint. */

import type { RSRecord } from '@/lib/neon/repair-service-queries';
import { formatPhoneNumber } from '@/utils/phone';
import { resolveRepairContact } from '@/lib/repair/contact-info';

/** The buyer, through the shared rule (`@/lib/repair/contact-info`): */

/** Customer name — normalized column, else the legacy string's name part. */
export function repairCustomerName(repair: RSRecord): string {
  return resolveRepairContact(repair).name ?? '';
}

/** Raw customer phone — normalized column, else the legacy string's phone part. */
export function repairCustomerPhone(repair: RSRecord): string {
  return resolveRepairContact(repair).phone ?? '';
}

/** Formatted phone for display (000-000-0000). */
export function repairPhoneDisplay(repair: RSRecord): string {
  return formatPhoneNumber(repairCustomerPhone(repair));
}

/** Linked source order id (empty = walk-in). */
export function repairOrderValue(repair: RSRecord): string {
  return String(repair.source_order_id || '').trim();
}

/** Ticket number (RS-#### fallback lives server-side on create). */
export function repairTicketValue(repair: RSRecord): string {
  return String(repair.ticket_number || '').trim();
}

/** Created-at instant for the Date column / sort (empty → null). */
export function repairCreatedAtSource(repair: RSRecord): string | null {
  return (repair.created_at || '').trim() || null;
}

/**
 * Price display — the free-text `price` string prefixed with `$` (unless it
 * already carries one). Empty → null so the cell renders the em-dash.
 */
export function repairPriceDisplay(repair: RSRecord): string | null {
  const raw = String(repair.price || '').trim();
  if (!raw) return null;
  return raw.startsWith('$') ? raw : `$${raw}`;
}

/** Numeric price for sorting (parsed from the free-text value; 0 when absent). */
export function repairPriceSortValue(repair: RSRecord): number {
  const cleaned = String(repair.price || '').replace(/[^0-9.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}
