import type { CarrierCode, ShipmentStatusCategory } from '@/lib/shipping/shipment-status';
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

function readShippedTypeFilter(searchParams: ParamReader): ShippedTypeFilter {
  const raw = String(searchParams.get('shippedFilter') || '').toLowerCase();
  if (raw === 'orders' || raw === 'sku' || raw === 'fba') return raw;
  return 'all';
}

function parseStaffId(raw: string | null): number | null {
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

/** Intentional "no date window" — Clear on the week chip; blocks current-week seed. */
const SHIPPED_ALL_DATES_PARAM = 'allDates';

export function readShippedAllDates(searchParams: ParamReader): boolean {
  const raw = String(searchParams.get(SHIPPED_ALL_DATES_PARAM) || '').toLowerCase();
  return raw === '1' || raw === 'true';
}

/**
 * The fetch window for Shipped. Default is this warehouse week. `allDates=1`
 * (or a carrier/status/exception facet) is all-time. An explicit `dateFrom`/`dateTo`
 * wins over the week seed.
 */
export function shippedEffectiveDateWindow(args: {
  allDates: boolean;
  dateFrom: string;
  dateTo: string;
  anyCarrierFilter: boolean;
  weekStart: string;
  weekEnd: string;
}): { start: string; end: string } {
  if (args.allDates || args.anyCarrierFilter) return { start: '', end: '' };
  if (/^\d{4}-\d{2}-\d{2}$/.test(args.dateFrom)) {
    const end = /^\d{4}-\d{2}-\d{2}$/.test(args.dateTo) ? args.dateTo : args.dateFrom;
    return { start: args.dateFrom, end };
  }
  return { start: args.weekStart, end: args.weekEnd };
}

/** Default week seed is an active filter the operator can clear. */
export function shippedWeekFilterActive(args: {
  allDates: boolean;
  hasDateRange: boolean;
  anyCarrierFilter: boolean;
}): boolean {
  return !args.allDates && !args.hasDateRange && !args.anyCarrierFilter;
}
