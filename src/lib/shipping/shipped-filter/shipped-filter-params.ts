import {
  addDaysToDateKey,
  dateKeyToLocalDate,
  isDateKey,
  localDateToDateKey,
  warehouseCivilTimeToInstant,
} from '@/utils/date';
import { getWeekRangeForOffset } from '@/lib/dashboard-week-range';
import type { ShippedTypeFilter } from './shipped-filter-constants';

type ParamReader = URLSearchParams | { get: (k: string) => string | null };

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

/** Explicit "no date window" — all-time (the Shipped buckets' locate link carries it). */
export const SHIPPED_ALL_DATES_PARAM = 'allDates';

export function readShippedAllDates(searchParams: ParamReader): boolean {
  const raw = String(searchParams.get(SHIPPED_ALL_DATES_PARAM) || '').toLowerCase();
  return raw === '1' || raw === 'true';
}

/**
 * The fetch window for Shipped. Default is ALL-TIME — every package packed and
 * scanned out (owner 2026-09-29: the desk showed only this week's pack scans).
 * An explicit `dateFrom`/`dateTo` narrows to that range; an explicit
 * `?shippedWeekOffset` (whole weeks back) to that warehouse week; `allDates=1`
 * forces all-time. The type / carrier / status / exceptions filters narrow
 * WITHIN the window (operator ruling 2026-09-26: answered in SQL over the range).
 */
export function shippedEffectiveDateWindow(args: {
  allDates: boolean;
  dateFrom: string;
  dateTo: string;
  /** The `?shippedWeekOffset` week, when the URL names one. */
  week: { start: string; end: string } | null;
}): { start: string; end: string } {
  if (args.allDates) return { start: '', end: '' };
  if (/^\d{4}-\d{2}-\d{2}$/.test(args.dateFrom)) {
    const end = /^\d{4}-\d{2}-\d{2}$/.test(args.dateTo) ? args.dateTo : args.dateFrom;
    return { start: args.dateFrom, end };
  }
  return args.week ?? { start: '', end: '' };
}

/** `?shippedWeekOffset` — whole weeks back from this one (0 = this week). */
export function readShippedWeekOffset(searchParams: ParamReader): number {
  const raw = searchParams.get('shippedWeekOffset');
  return raw == null ? 0 : Math.max(0, Number.parseInt(raw || '0', 10) || 0);
}

/** The Shipped list's window for these URL params — the list and its facet counts read this one derivation. */
export function readShippedDateWindow(searchParams: ParamReader): { start: string; end: string } {
  const named = searchParams.get('shippedWeekOffset') != null;
  const week = named ? getWeekRangeForOffset(readShippedWeekOffset(searchParams)) : null;
  return shippedEffectiveDateWindow({
    allDates: readShippedAllDates(searchParams),
    dateFrom: (searchParams.get('dateFrom') || '').trim(),
    dateTo: (searchParams.get('dateTo') || '').trim(),
    week: week ? { start: week.startStr, end: week.endStr } : null,
  });
}

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function readHhmm(searchParams: ParamReader, key: string): string | null {
  const raw = (searchParams.get(key) || '').trim();
  return HHMM_RE.test(raw) ? raw : null;
}

/** The URL's time-of-day narrowing, normalized: valid keys only, `dateTo` defaulted to `dateFrom`. */
export interface ShippedTimeParams {
  dateFrom: string;
  dateTo: string;
  timeFrom?: string;
  timeTo?: string;
}

/**
 * `?timeFrom` / `?timeTo` (`HH:mm`, 24h warehouse wall clock) on top of an
 * explicit `dateFrom`/`dateTo`. Null (no narrowing beyond the day window) when
 * neither time is valid, when there is no explicit date range, or under
 * `allDates`.
 */
export function readShippedTimeParams(searchParams: ParamReader): ShippedTimeParams | null {
  if (readShippedAllDates(searchParams)) return null;
  const timeFrom = readHhmm(searchParams, 'timeFrom');
  const timeTo = readHhmm(searchParams, 'timeTo');
  if (!timeFrom && !timeTo) return null;
  const dateFrom = (searchParams.get('dateFrom') || '').trim();
  if (!isDateKey(dateFrom)) return null;
  const rawTo = (searchParams.get('dateTo') || '').trim();
  return {
    dateFrom,
    dateTo: isDateKey(rawTo) ? rawTo : dateFrom,
    ...(timeFrom ? { timeFrom } : {}),
    ...(timeTo ? { timeTo } : {}),
  };
}

/**
 * The exact shipped-instant window `[dateFrom timeFrom, dateTo timeTo + 1 min)`
 * in the warehouse zone. Missing `timeFrom` = 00:00, missing `timeTo` = end of
 * day. The list fetch, its browser trim and the facet counts all read this.
 */
export function shippedTimeWindow(t: ShippedTimeParams): { fromIso: string; toIso: string } | null {
  const from = warehouseCivilTimeToInstant(t.dateFrom, t.timeFrom ?? '00:00');
  const toBase = t.timeTo
    ? warehouseCivilTimeToInstant(t.dateTo, t.timeTo)
    : warehouseCivilTimeToInstant(addDaysToDateKey(t.dateTo, 1), '00:00');
  if (!from || !toBase) return null;
  const to = t.timeTo ? new Date(toBase.getTime() + 60_000) : toBase;
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

export function readShippedTimeWindow(searchParams: ParamReader): { fromIso: string; toIso: string } | null {
  const t = readShippedTimeParams(searchParams);
  return t ? shippedTimeWindow(t) : null;
}

/** `?pickedBy` — the staffer who picked the order; positive int, else unset. */
export function readShippedPickedBy(searchParams: ParamReader): number | null {
  const raw = (searchParams.get('pickedBy') || '').trim();
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
