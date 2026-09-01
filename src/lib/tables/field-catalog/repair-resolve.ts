/**
 * Repair slot resolvers — row + fieldId → the resolved fact a slot cell paints.
 * Pure functions; no React, no hooks.
 *
 * This module also owns the family's FIELD-SOURCE helpers, which the row cells
 * and the comparators both read so a column always sorts by exactly what it
 * shows. They lived in the grid-layout file before the wave 1.4 port; moving
 * them here keeps the resolver a true leaf and makes "what the cell paints" and
 * "what a bound column resolves" one answer rather than two.
 *
 * `contact_info` is the legacy free-text fallback: `Name, Phone, Email`
 * comma-segments, read only when the normalized `customer_*` columns are empty.
 */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import { formatPhoneNumber } from '@/utils/phone';
import { formatDateKeyShort } from '@/utils/date';

function contactSegment(contactInfo: string | null | undefined, index: number): string {
  if (!contactInfo) return '';
  const parts = contactInfo.split(',').map((p) => p.trim());
  return parts[index] || '';
}

/** Customer name — normalized column, else the first contact_info segment. */
export function repairCustomerName(repair: RSRecord): string {
  return (repair.customer_name || '').trim() || contactSegment(repair.contact_info, 0);
}

/** Raw customer phone — normalized column, else the second contact_info segment. */
export function repairCustomerPhone(repair: RSRecord): string {
  return (repair.customer_phone || '').trim() || contactSegment(repair.contact_info, 1);
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

function nullable(value: string): string | null {
  return value.trim() || null;
}

/**
 * Resolve one bound field for one row. Unknown field id → null (the cell
 * dashes); the layout resolver has already dropped stale bindings.
 */
export function resolveRepairSlotValue(
  repair: RSRecord,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'repair.service':
      return { kind: 'value', text: `#${repair.id}` };
    case 'repair.created': {
      const raw = repairCreatedAtSource(repair);
      return { kind: 'value', text: raw ? formatDateKeyShort(raw.slice(0, 10)) : null };
    }
    case 'repair.customer':
      return { kind: 'value', text: nullable(repairCustomerName(repair)) };
    case 'repair.phone':
      return { kind: 'value', text: nullable(repairPhoneDisplay(repair)) };
    case 'repair.price':
      return { kind: 'value', text: repairPriceDisplay(repair) };
    case 'repair.order':
      // A walk-in has no source order, and "Walk-in" is what the desk calls
      // that — an honest word for the absence, not an invented order id.
      return { kind: 'value', text: nullable(repairOrderValue(repair)) ?? 'Walk-in' };
    case 'repair.ticket':
      return { kind: 'value', text: nullable(repairTicketValue(repair)) };
    case 'repair.status':
      return { kind: 'value', text: nullable(String(repair.status ?? '')) };
    default:
      return null;
  }
}
