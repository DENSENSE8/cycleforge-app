import { fromZonedTime } from 'date-fns-tz';
import { isHour12 } from '@/lib/time-format/store';

/** Warehouse business zone — every civil “day” in ops is this zone unless noted. */
export const WAREHOUSE_TIME_ZONE = 'America/Los_Angeles';
const PST_TIME_ZONE = WAREHOUSE_TIME_ZONE;

const ISO_DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_NAIVE_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/;
const ISO_NAIVE_FRACTION_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}\.\d+$/;
const SLASH_DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/;
const TZ_SUFFIX_RE = /(Z|[+-]\d{2}:\d{2})$/i;

// ─── Civil date keys (YYYY-MM-DD) ─────────────────────────────────────────────

interface DateKeyParts {
  y: number;
  m: number;
  d: number;
}

/** True when `raw` is exactly `YYYY-MM-DD`. */
export function isDateKey(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return ISO_DATE_ONLY_RE.test(raw.trim());
}

/** Parse a civil date key into parts, or null if invalid / out of range. */
export function parseDateKey(raw: string | null | undefined): DateKeyParts | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!ISO_DATE_ONLY_RE.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  // Reject impossible days (e.g. 2026-02-31) via UTC round-trip.
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    return null;
  }
  return { y, m, d };
}

/** Build a civil date key from Y/M/D (1-based month). Returns '' if invalid. */
export function dateKeyFromParts(y: number, m: number, d: number): string {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return '';
  const key = `${y}-${pad2(m)}-${pad2(d)}`;
  return parseDateKey(key) ? key : '';
}

/**
 * Add (or subtract) whole days to a civil date key without host-TZ influence.
 * Uses UTC day arithmetic on the Y-M-D components.
 */
export function addDaysToDateKey(dateKey: string, deltaDays: number): string {
  const parts = parseDateKey(dateKey);
  if (!parts) return '';
  const utc = Date.UTC(parts.y, parts.m - 1, parts.d) + deltaDays * 86_400_000;
  const next = new Date(utc);
  return dateKeyFromParts(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

/** Signed day difference `b - a` in whole civil days (same key → 0). */
export function diffDaysDateKey(a: string, b: string): number | null {
  const pa = parseDateKey(a);
  const pb = parseDateKey(b);
  if (!pa || !pb) return null;
  const ia = Math.floor(Date.UTC(pa.y, pa.m - 1, pa.d) / 86_400_000);
  const ib = Math.floor(Date.UTC(pb.y, pb.m - 1, pb.d) / 86_400_000);
  return ib - ia;
}

/**
 * Day-of-week for a civil date key: 0 = Sunday … 6 = Saturday
 * (ISO civil calendar, independent of host TZ).
 */
export function weekdayOfDateKey(dateKey: string): number | null {
  const parts = parseDateKey(dateKey);
  if (!parts) return null;
  return new Date(Date.UTC(parts.y, parts.m - 1, parts.d, 12)).getUTCDay();
}

/**
 * Short label for a civil date key, e.g. "Jun 1".
 * Never depends on the host timezone (safe for UTC CI).
 */
export function formatDateKeyShort(dateKey: string): string {
  const parts = parseDateKey(dateKey);
  if (!parts) return dateKey || '';
  const date = new Date(Date.UTC(parts.y, parts.m - 1, parts.d, 12));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/**
 * Longer civil label, e.g. "Mon, Jun 1" or "Monday, June 1, 2026".
 * Independent of host TZ.
 */
export function formatDateKeyMedium(
  dateKey: string,
  options?: { weekday?: 'short' | 'long' | 'none'; withYear?: boolean },
): string {
  const parts = parseDateKey(dateKey);
  if (!parts) return dateKey || '';
  const date = new Date(Date.UTC(parts.y, parts.m - 1, parts.d, 12));
  const weekday = options?.weekday ?? 'short';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    ...(weekday === 'none' ? {} : { weekday }),
    month: 'short',
    day: 'numeric',
    ...(options?.withYear ? { year: 'numeric' } : {}),
  }).format(date);
}

/** Calendar-widget bridge only: */
export function dateKeyToLocalDate(dateKey: string): Date | undefined {
  const parts = parseDateKey(dateKey);
  if (!parts) return undefined;
  return new Date(parts.y, parts.m - 1, parts.d);
}

/**
 * Calendar-widget bridge only: local `Date` from a picker → civil key via
 * local Y/M/D getters (same frame as {@link dateKeyToLocalDate}).
 */
export function localDateToDateKey(d: Date | undefined | null): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  return dateKeyFromParts(d.getFullYear(), d.getMonth() + 1, d.getDate()) || null;
}

/**
 * Inclusive warehouse-day bounds as UTC ISO strings for SQL / API filters.
 * Day D in America/Los_Angeles → [startIso, endIso] covering that wall-clock day.
 */
export function warehouseDayUtcBounds(
  dateKey: string,
): { startIso: string; endIso: string } | null {
  if (!parseDateKey(dateKey)) return null;
  const start = fromZonedTime(`${dateKey}T00:00:00.000`, PST_TIME_ZONE);
  const end = fromZonedTime(`${dateKey}T23:59:59.999`, PST_TIME_ZONE);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** Warehouse civil day + wall clock (`HH:MM`) → the true instant. */
export function warehouseCivilTimeToInstant(dateKey: string, hhmm: string): Date | null {
  if (!parseDateKey(dateKey) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) return null;
  const instant = fromZonedTime(`${dateKey}T${hhmm}:00.000`, PST_TIME_ZONE);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

/** Yesterday’s warehouse civil date key. */
export function getYesterdayPSTDateKey(anchor?: string): string {
  const today = anchor && parseDateKey(anchor) ? anchor : getCurrentPSTDateKey();
  return addDaysToDateKey(today, -1);
}

/** Start of a rolling N-day window ending on warehouse today (inclusive). */
export function getRollingDaysStartKey(days: number, anchor?: string): string {
  const n = Math.max(1, Math.floor(days));
  const today = anchor && parseDateKey(anchor) ? anchor : getCurrentPSTDateKey();
  return addDaysToDateKey(today, -(n - 1));
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Render a wall-clock time as 12-hour with AM/PM (e.g. "4:17:50 PM"). */
function to12h(hour24: number, minute: number, second: number, withSeconds = true): string {
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const h12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return withSeconds
    ? `${h12}:${pad2(minute)}:${pad2(second)} ${period}`
    : `${h12}:${pad2(minute)} ${period}`;
}

/** Render a wall-clock time as zero-padded 24-hour (e.g. "16:17:50"). */
function to24h(hour24: number, minute: number, second: number, withSeconds = true): string {
  return withSeconds
    ? `${pad2(hour24)}:${pad2(minute)}:${pad2(second)}`
    : `${pad2(hour24)}:${pad2(minute)}`;
}

/**
 * Resolve the effective 12h/24h choice: an explicit caller override wins,
 * otherwise the user's live time-format preference (defaults to 12h — the
 * historical behavior — on the server and before hydration).
 */
function resolveHour12(explicit?: boolean): boolean {
  return explicit ?? isHour12();
}

/** Wall clock from h/m/s in the resolved format. */
function formatWallClock(
  hour24: number,
  minute: number,
  second: number,
  opts?: { hour12?: boolean; withSeconds?: boolean },
): string {
  const withSeconds = opts?.withSeconds ?? true;
  return resolveHour12(opts?.hour12)
    ? to12h(hour24, minute, second, withSeconds)
    : to24h(hour24, minute, second, withSeconds);
}

/** Intl time-part options for the resolved format (used by the Date/parsed branches). */
function intlTimeOptions(hour12: boolean, withSeconds: boolean): Intl.DateTimeFormatOptions {
  return hour12
    ? { hour: 'numeric', minute: '2-digit', ...(withSeconds ? { second: '2-digit' } : {}), hour12: true }
    : { hour: '2-digit', minute: '2-digit', ...(withSeconds ? { second: '2-digit' } : {}), hourCycle: 'h23' };
}

function getPstYmdFromDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) return '';
  return `${year}-${month}-${day}`;
}

export function formatPSTTimestamp(date?: Date): string {
  const base = date ?? new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(base);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  const hour = parts.find((part) => part.type === 'hour')?.value;
  const minute = parts.find((part) => part.type === 'minute')?.value;
  const second = parts.find((part) => part.type === 'second')?.value;

  if (!year || !month || !day || !hour || !minute || !second) {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: PST_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).format(base).replace(',', '');
  }

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/** True UTC ISO-8601 instant (host-TZ independent). */
export function formatApiInstant(date?: Date): string {
  const base = date ?? new Date();
  if (Number.isNaN(base.getTime())) return new Date(0).toISOString();
  return base.toISOString();
}

export function formatApiOffsetTimestamp(date?: Date): string {
  return formatApiInstant(date).replace(/\.\d{3}Z$/, '+0000');
}

export function normalizePSTTimestamp(
  input: string | Date | null | undefined,
  options?: { fallbackToNow?: boolean }
): string | null {
  const fallbackToNow = options?.fallbackToNow ?? false;
  if (input == null || input === '') {
    return fallbackToNow ? formatPSTTimestamp() : null;
  }

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return fallbackToNow ? formatPSTTimestamp() : null;
    return formatPSTTimestamp(input);
  }

  const raw = String(input).trim();
  if (!raw || raw === '1') return fallbackToNow ? formatPSTTimestamp() : null;

  if (ISO_DATE_ONLY_RE.test(raw)) return `${raw} 00:00:00`;

  if (SLASH_DATE_RE.test(raw)) {
    const [datePart, timePart] = raw.replace(',', '').split(/\s+/, 2);
    const [month, day, year] = datePart.split('/').map(Number);
    if (!month || !day || !year) return fallbackToNow ? formatPSTTimestamp() : null;
    const [hh = '00', mm = '00', ss = '00'] = (timePart || '00:00:00').split(':');
    return `${year}-${pad2(month)}-${pad2(day)} ${pad2(Number(hh))}:${pad2(Number(mm))}:${pad2(Number(ss))}`;
  }

  if ((ISO_NAIVE_RE.test(raw) || ISO_NAIVE_FRACTION_RE.test(raw)) && !TZ_SUFFIX_RE.test(raw)) {
    const normalized = raw.replace('T', ' ');
    const [datePart, timePartRaw] = normalized.split(' ');
    const timePart = (timePartRaw || '00:00:00').split('.')[0];
    const [hh = '00', mm = '00', ss = '00'] = timePart.split(':');
    return `${datePart} ${pad2(Number(hh))}:${pad2(Number(mm))}:${pad2(Number(ss))}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return fallbackToNow ? formatPSTTimestamp() : null;
  return formatPSTTimestamp(parsed);
}

export function getCurrentPSTDateKey(): string {
  return getPstYmdFromDate(new Date());
}

export function toPSTDateKey(input: string | Date | null | undefined): string {
  if (!input) return '';

  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? '' : getPstYmdFromDate(input);
  }

  const raw = String(input).trim();
  if (!raw || raw === '1') return '';

  if (ISO_DATE_ONLY_RE.test(raw)) return raw;

  if (SLASH_DATE_RE.test(raw)) {
    const [datePart] = raw.split(' ');
    const [month, day, year] = datePart.split('/').map(Number);
    if (!month || !day || !year) return '';
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  if ((ISO_NAIVE_RE.test(raw) || ISO_NAIVE_FRACTION_RE.test(raw)) && !TZ_SUFFIX_RE.test(raw)) {
    return raw.slice(0, 10);
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return getPstYmdFromDate(parsed);
}

export function formatDateTimePST(
  input: string | Date | null | undefined,
  options?: { hour12?: boolean },
): string {
  if (!input) return '—';

  const hour12 = resolveHour12(options?.hour12);
  const timeOpts = intlTimeOptions(hour12, true);

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return '—';
    return input
      .toLocaleString('en-US', {
        timeZone: PST_TIME_ZONE,
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        ...timeOpts,
      })
      .replace(',', '');
  }

  const raw = String(input).trim();
  if (!raw || raw === '1') return '—';

  if (SLASH_DATE_RE.test(raw)) {
    const [datePart, timePart] = raw.split(/\s+/, 2);
    const [month, day, year] = datePart.split('/').map(Number);
    if (!month || !day || !year) return '—';

    const [h = '00', m = '00', s = '00'] = (timePart || '00:00:00').split(':');
    return `${pad2(month)}/${pad2(day)}/${year} ${formatWallClock(Number(h), Number(m), Number(s), { hour12 })}`;
  }

  if (ISO_DATE_ONLY_RE.test(raw)) {
    const [year, month, day] = raw.split('-').map(Number);
    return `${pad2(month)}/${pad2(day)}/${year} ${formatWallClock(0, 0, 0, { hour12 })}`;
  }

  if ((ISO_NAIVE_RE.test(raw) || ISO_NAIVE_FRACTION_RE.test(raw)) && !TZ_SUFFIX_RE.test(raw)) {
    const normalized = raw.replace(' ', 'T');
    const [datePart, timePartRaw] = normalized.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const timePart = (timePartRaw || '00:00:00').split('.')[0];
    const [hh = '00', mm = '00', ss = '00'] = timePart.split(':');
    return `${pad2(month)}/${pad2(day)}/${year} ${formatWallClock(Number(hh), Number(mm), Number(ss), { hour12 })}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;

  return parsed
    .toLocaleString('en-US', {
      timeZone: PST_TIME_ZONE,
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      ...timeOpts,
    })
    .replace(',', '');
}

/** Dense instant face for ledger columns: */
export function formatMonthDayTimePST(
  input: string | Date | null | undefined,
  options?: { hour12?: boolean },
): string {
  if (!input) return '—';
  if (!(input instanceof Date)) {
    const raw = String(input).trim();
    if (!raw || raw === '1') return '—';
  } else if (Number.isNaN(input.getTime())) {
    return '—';
  }

  const dateKey = toPSTDateKey(input);
  if (!dateKey) return '—';
  const day = formatDateKeyShort(dateKey);
  const time = formatTime12hPST(input, { withSeconds: false, hour12: options?.hour12 });
  if (!day || time === '--:--') return '—';
  return `${day}, ${time}`;
}

export function formatDatePST(
  input: string | Date | null | undefined,
  options?: { shortYear?: boolean; withLeadingZeros?: boolean }
): string {
  if (!input) return '—';
  const dateKey = toPSTDateKey(input);
  if (!dateKey) return '—';

  const [yearRaw, monthRaw, dayRaw] = dateKey.split('-').map(Number);
  const shortYear = options?.shortYear ?? false;
  const withLeadingZeros = options?.withLeadingZeros ?? false;
  const month = withLeadingZeros ? pad2(monthRaw) : String(monthRaw);
  const day = withLeadingZeros ? pad2(dayRaw) : String(dayRaw);
  const year = shortYear ? String(yearRaw).slice(-2) : String(yearRaw);

  return `${month}/${day}/${year}`;
}

/**
 * Ops-friendly stage time for dense rows: relative under 1 hour (`12m ago`),
 * otherwise warehouse wall-clock (`3:45 PM`). Uses America/Los_Angeles for the
 * clock form; relative is elapsed from now against the warehouse instant.
 */
/**
 * Hours (or days) an order has sat in the current lane — prioritization without
 * opening detail. Prefer stage entry instants (tested/packed/ship) over created_at.
 * Returns null when no usable timestamp (caller omits the slot).
 */
export function formatLaneAgeCompact(
  input: string | Date | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  if (input == null || input === '') return null;

  let ms: number;
  if (input instanceof Date) {
    ms = input.getTime();
  } else {
    const raw = String(input).trim();
    if (TZ_SUFFIX_RE.test(raw)) {
      ms = Date.parse(raw);
    } else {
      const normalized = normalizePSTTimestamp(raw, { fallbackToNow: false });
      if (!normalized) return null;
      ms = fromZonedTime(normalized.replace(' ', 'T'), PST_TIME_ZONE).getTime();
    }
  }
  if (!Number.isFinite(ms)) return null;

  const delta = nowMs - ms;
  if (delta < 0) return null;
  const hours = Math.floor(delta / 3_600_000);
  if (hours < 1) {
    const mins = Math.max(0, Math.floor(delta / 60_000));
    if (mins < 1) return '<1m';
    return `${mins}m`;
  }
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/** Tone for lane-age chips — progressive SLA (fresh stays muted; older heats up). */
export function getLaneAgeTone(hoursApprox: number | null): string {
  if (hoursApprox == null) return 'text-text-muted';
  if (hoursApprox >= 192) return 'text-text-danger'; // ≥8d
  if (hoursApprox >= 72) return 'text-text-warning'; // ≥3d
  if (hoursApprox >= 24) return 'text-amber-600'; // ≥1d
  if (hoursApprox >= 8) return 'text-yellow-700';
  return 'text-text-muted';
}

/**
 * Lane age beside a days-late fact: prefer omitting lane age in the row
 * (`showLaneAge = label && daysLate == null`). Kept for callers that still
 * render both and need a quiet secondary tone.
 */
export function getLaneAgeToneBesideDeadline(
  hoursApprox: number | null,
  daysLate: number | null,
): string {
  if (daysLate != null) return 'text-text-muted';
  return getLaneAgeTone(hoursApprox);
}

/** Elapsed hours for tone helpers (null when unparseable). */
export function getLaneAgeHours(
  input: string | Date | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  if (input == null || input === '') return null;
  let ms: number;
  if (input instanceof Date) {
    ms = input.getTime();
  } else {
    const raw = String(input).trim();
    if (TZ_SUFFIX_RE.test(raw)) {
      ms = Date.parse(raw);
    } else {
      const normalized = normalizePSTTimestamp(raw, { fallbackToNow: false });
      if (!normalized) return null;
      ms = fromZonedTime(normalized.replace(' ', 'T'), PST_TIME_ZONE).getTime();
    }
  }
  if (!Number.isFinite(ms)) return null;
  const delta = nowMs - ms;
  if (delta < 0) return null;
  return delta / 3_600_000;
}

export function formatOpsStageTime(
  input: string | Date | null | undefined,
  nowMs: number = Date.now(),
): string {
  const placeholder = '--:--';
  if (input == null || input === '') return placeholder;

  let ms: number;
  if (input instanceof Date) {
    ms = input.getTime();
  } else {
    const raw = String(input).trim();
    if (TZ_SUFFIX_RE.test(raw)) {
      ms = Date.parse(raw);
    } else {
      const normalized = normalizePSTTimestamp(raw, { fallbackToNow: false });
      if (!normalized) return placeholder;
      // Naive warehouse wall → true instant in America/Los_Angeles.
      ms = fromZonedTime(normalized.replace(' ', 'T'), PST_TIME_ZONE).getTime();
    }
  }
  if (!Number.isFinite(ms)) return placeholder;

  const delta = nowMs - ms;
  if (delta >= 0 && delta < 60 * 60 * 1000) {
    const mins = Math.max(0, Math.floor(delta / 60_000));
    if (mins < 1) return 'just now';
    return `${mins}m ago`;
  }
  return formatTime12hPST(input);
}

/** Wall-clock time in America/Los_Angeles, following the user's clock-format preference (12-hour with AM/PM by default, or 24-hour `HH:mm`). */
export function formatTime12hPST(
  input: string | Date | null | undefined,
  options?: { withSeconds?: boolean; hour12?: boolean }
): string {
  const placeholder = '--:--';
  const withSeconds = options?.withSeconds ?? false;
  const hour12 = resolveHour12(options?.hour12);

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return placeholder;
    return new Intl.DateTimeFormat('en-US', {
      timeZone: PST_TIME_ZONE,
      ...intlTimeOptions(hour12, withSeconds),
    }).format(input);
  }

  const raw = String(input ?? '').trim();
  if (!raw || raw === '1') return placeholder;

  const normalized = normalizePSTTimestamp(raw, { fallbackToNow: false });
  if (!normalized) return placeholder;

  const timePart = normalized.split(' ')[1];
  if (!timePart) return placeholder;

  const [hhRaw, mmRaw, ssRaw = '0'] = timePart.split(':');
  const h24 = Number(hhRaw);
  const m = Number(mmRaw);
  const s = Number(ssRaw);
  if (!Number.isFinite(h24) || !Number.isFinite(m) || !Number.isFinite(s)) return placeholder;

  return formatWallClock(h24, m, s, { hour12, withSeconds });
}

/** Stage/row clock time (no seconds) that FOLLOWS the user's clock-format preference: */
export function formatStageClockTimePST(input: string | Date | null | undefined): string {
  return formatTime12hPST(input, { withSeconds: false });
}

export function formatDateWithOrdinal(dateStr: string): string {
  try {
    if (!dateStr) return 'Unknown';

    const getOrdinal = (value: number) => {
      const suffixes = ['th', 'st', 'nd', 'rd'];
      const mod100 = value % 100;
      return value + (suffixes[(mod100 - 20) % 10] || suffixes[mod100] || suffixes[0]);
    };

    const key = toPSTDateKey(dateStr) || (ISO_DATE_ONLY_RE.test(dateStr) ? dateStr : '');
    const parts = key ? parseDateKey(key) : null;
    if (!parts) {
      const fallback = new Date(dateStr);
      if (Number.isNaN(fallback.getTime())) return dateStr;
      const k = getPstYmdFromDate(fallback);
      const p = parseDateKey(k);
      if (!p) return dateStr;
      return formatDateWithOrdinal(k);
    }

    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const dow = weekdayOfDateKey(key)!;
    return `${days[dow]}, ${months[parts.m - 1]} ${getOrdinal(parts.d)}`;
  } catch {
    return dateStr;
  }
}

/**
 * Compact week range: "MAY 12th - 16th" when both dates share a month/year,
 * "MAY 30th - JUN 2nd" when they cross months. Falls back to the start date
 * alone when only one is parseable.
 */
export function formatWeekRangeCompact(startStr: string, endStr: string): string {
  const getOrdinal = (value: number) => {
    const suffixes = ['th', 'st', 'nd', 'rd'];
    const mod100 = value % 100;
    return value + (suffixes[(mod100 - 20) % 10] || suffixes[mod100] || suffixes[0]);
  };
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  const parse = (raw: string): DateKeyParts | null => {
    if (!raw) return null;
    const key = toPSTDateKey(raw) || (ISO_DATE_ONLY_RE.test(raw) ? raw : '');
    return key ? parseDateKey(key) : null;
  };

  const start = parse(startStr);
  const end = parse(endStr);
  if (!start && !end) return '';
  if (!end) return `${months[start!.m - 1]} ${getOrdinal(start!.d)}`;
  if (!start) return `${months[end.m - 1]} ${getOrdinal(end.d)}`;

  const sameMonth = start.m === end.m && start.y === end.y;
  if (sameMonth) {
    return `${months[start.m - 1]} ${getOrdinal(start.d)} - ${getOrdinal(end.d)}`;
  }
  return `${months[start.m - 1]} ${getOrdinal(start.d)} - ${months[end.m - 1]} ${getOrdinal(end.d)}`;
}

// ─── Days-late helpers ──────────────────────────────────────────────────────

/**
 * Returns how many days past the deadline (0 if not late or no date).
 * Accepts an optional fallback date (e.g. created_at when ship_by is missing).
 */
export function getDaysLateNumber(deadlineAt: string | null | undefined, fallbackDate?: string | null): number {
  const deadlineKey = toPSTDateKey(deadlineAt) || toPSTDateKey(fallbackDate);
  const todayKey = getCurrentPSTDateKey();
  if (!deadlineKey || !todayKey) return 0;
  const [dy, dm, dd] = deadlineKey.split('-').map(Number);
  const [ty, tm, td] = todayKey.split('-').map(Number);
  const deadlineIndex = Math.floor(Date.UTC(dy, dm - 1, dd) / 86400000);
  const todayIndex = Math.floor(Date.UTC(ty, tm - 1, td) / 86400000);
  return Math.max(0, todayIndex - deadlineIndex);
}

/**
 * Same as getDaysLateNumber but returns null when no deadline is provided.
 * Useful when callers need to distinguish "no deadline" from "0 days late".
 */
export function getDaysLateNullable(deadlineAt: string | null | undefined): number | null {
  const deadlineKey = toPSTDateKey(deadlineAt);
  if (!deadlineKey) return null;
  const todayKey = getCurrentPSTDateKey();
  if (!todayKey) return null;
  const [dy, dm, dd] = deadlineKey.split('-').map(Number);
  const [ty, tm, td] = todayKey.split('-').map(Number);
  const deadlineIndex = Math.floor(Date.UTC(dy, dm - 1, dd) / 86400000);
  const todayIndex = Math.floor(Date.UTC(ty, tm - 1, td) / 86400000);
  return Math.max(0, todayIndex - deadlineIndex);
}

/** Tailwind text-color class based on days late — progressive SLA tiers for
 *  ops backlog tables (not alarm-red at day 1). Null = no deadline.
 *  0 on-time · 1–2 mild warn · 3–7 elevated · 8+ critical. */
export function getDaysLateTone(daysLate: number | null): string {
  if (daysLate === null) return 'text-text-soft';
  if (daysLate >= 8) return 'text-text-danger';
  if (daysLate >= 3) return 'text-text-warning';
  if (daysLate >= 1) return 'text-amber-600';
  return 'text-text-muted';
}

// ─── Week range helpers ─────────────────────────────────────────────────────

export interface WeekRange {
  start: Date;
  end: Date;
  startStr: string;
  endStr: string;
}

/** Compute Sunday–Saturday civil date range for a week offset (0 = warehouse week containing today, 1 = previous week, …). */
export function computeWeekRange(weekOffset: number, anchorDateKey?: string): WeekRange {
  const todayPst =
    anchorDateKey && parseDateKey(anchorDateKey) ? anchorDateKey : getCurrentPSTDateKey();
  const dow = weekdayOfDateKey(todayPst) ?? 0; // 0 = Sunday
  const sundayKey = addDaysToDateKey(todayPst, -dow - weekOffset * 7);
  const saturdayKey = addDaysToDateKey(sundayKey, 6);
  const start = dateKeyToLocalDate(sundayKey) ?? new Date();
  const end = dateKeyToLocalDate(saturdayKey) ?? new Date();
  end.setHours(23, 59, 59, 999);
  return {
    start,
    end,
    startStr: sundayKey,
    endStr: saturdayKey,
  };
}
