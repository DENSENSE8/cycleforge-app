import type { CarrierCode, ShipmentStatusCategory } from '@/components/shipping/ShipmentStatusBadge';
import {
  dateKeyToLocalDate,
  isDateKey,
  localDateToDateKey,
} from '@/utils/date';
import { VALID_CARRIERS, VALID_STATUS, type ShippedTypeFilter } from './shipped-filter-constants';

type ParamReader = URLSearchParams | { get: (k: string) => string | null };

export function readShippedCarrierFilter(searchParams: ParamReader): CarrierCode | null {
  const raw = String(searchParams.get('carrier') || '').toUpperCase();
  return VALID_CARRIERS.has(raw as CarrierCode) ? (raw as CarrierCode) : null;
}

export function readShippedStatusFilter(searchParams: ParamReader): ShipmentStatusCategory | null {
  const raw = String(searchParams.get('statusCategory') || '').toUpperCase();
  return VALID_STATUS.has(raw as ShipmentStatusCategory) ? (raw as ShipmentStatusCategory) : null;
}

export function readShippedExceptionsFilter(searchParams: ParamReader): boolean {
  const raw = String(searchParams.get('exceptions') || '').toLowerCase();
  return raw === '1' || raw === 'true';
}

export function readShippedTypeFilter(searchParams: ParamReader): ShippedTypeFilter {
  const raw = String(searchParams.get('shippedFilter') || '').toLowerCase();
  if (raw === 'orders' || raw === 'sku' || raw === 'fba') return raw;
  return 'all';
}

export function parseStaffId(raw: string | null): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * URL civil date (`YYYY-MM-DD`) → local calendar `Date` for react-day-picker.
 * Host-TZ-safe: uses {@link dateKeyToLocalDate}, never `T00:00:00` re-zone.
 */
export function parseISODate(raw: string | null): Date | undefined {
  if (!raw || !isDateKey(raw)) return undefined;
  return dateKeyToLocalDate(raw.trim());
}

/** Local calendar `Date` from a picker → civil key for the URL. */
export function toISODate(d: Date | undefined): string | null {
  return localDateToDateKey(d);
}
