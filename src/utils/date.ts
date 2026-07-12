import { fromZonedTime } from 'date-fns-tz';

/** Warehouse business zone — every civil “day” in ops is this zone unless noted. */
export const WAREHOUSE_TIME_ZONE = 'America/Los_Angeles';
const PST_TIME_ZONE = WAREHOUSE_TIME_ZONE;

const ISO_DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_NAIVE_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/;
const ISO_NAIVE_FRACTION_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}\.\d+$/;
const SLASH_DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/;
const TZ_SUFFIX_RE = /(Z|[+-]\d{2}:\d{2})$/i;

// ─── Civil date keys (YYYY-MM-DD) ─────────────────────────────────────────────
//
// A *civil date* is a calendar day with no time-of-day. It is NOT an Instant.
// Never parse a date key as host-local midnight (`new Date(`${key}T00:00:00`)`)
// and re-format it in another zone — that is the class of bug that shifts a day
// on UTC CI runners. All arithmetic and display for date keys go through these
// helpers.
//
// Three types (keep them separate):
//   Instant      → ISO-8601 with Z/offset; format with timeZone: WAREHOUSE_TIME_ZONE
//   Civil date   → YYYY-MM-DD only; use parseDateKey / addDaysToDateKey / formatDateKey*
//   Zoned wall   → Instant + explicit zone (SQL: timezone('America/Los_Angeles', ts)::date)

export interface DateKeyParts {
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

/**
 * Calendar-widget bridge only: civil key → local-midnight `Date` for
 * react-day-picker / native date inputs. Round-trip ONLY with
 * {@link localDateToDateKey}. Do not pass this `Date` to zoned formatters
 * or `toISOString()` for warehouse day logic.
 */
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

export function getCurrentPSTTime(): Date {
  return new Date();
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

export function toISOStringPST(timestamp: string): string {
  try {
    if (timestamp && timestamp.includes('/')) {
      const [datePart, timePart] = timestamp.split(' ');
      const [month, day, year] = datePart.split('/');
      const date = new Date(
        `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${timePart || '00:00:00'}`
      );

      return date
        .toLocaleString('en-US', {
          timeZone: PST_TIME_ZONE,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hourCycle: 'h23',
        })
        .replace(/(\d+)\/(\d+)\/(\d+), (\d+):(\d+):(\d+)/, '$3-$1-$2T$4:$5:$6');
    }

    return timestamp;
  } catch (error) {
    console.error('Error converting timestamp to ISO PST:', error);
    return timestamp;
  }
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

export function formatDateTimePST(input: string | Date | null | undefined): string {
  if (!input) return 'N/A';

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return 'N/A';
    return input
      .toLocaleString('en-US', {
        timeZone: PST_TIME_ZONE,
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      })
      .replace(',', '');
  }

  const raw = String(input).trim();
  if (!raw || raw === '1') return 'N/A';

  if (SLASH_DATE_RE.test(raw)) {
    const [datePart, timePart] = raw.split(/\s+/, 2);
    const [month, day, year] = datePart.split('/').map(Number);
    if (!month || !day || !year) return 'N/A';

    const [h = '00', m = '00', s = '00'] = (timePart || '00:00:00').split(':');
    return `${pad2(month)}/${pad2(day)}/${year} ${to12h(Number(h), Number(m), Number(s))}`;
  }

  if (ISO_DATE_ONLY_RE.test(raw)) {
    const [year, month, day] = raw.split('-').map(Number);
    return `${pad2(month)}/${pad2(day)}/${year} ${to12h(0, 0, 0)}`;
  }

  if ((ISO_NAIVE_RE.test(raw) || ISO_NAIVE_FRACTION_RE.test(raw)) && !TZ_SUFFIX_RE.test(raw)) {
    const normalized = raw.replace(' ', 'T');
    const [datePart, timePartRaw] = normalized.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const timePart = (timePartRaw || '00:00:00').split('.')[0];
    const [hh = '00', mm = '00', ss = '00'] = timePart.split(':');
    return `${pad2(month)}/${pad2(day)}/${year} ${to12h(Number(hh), Number(mm), Number(ss))}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;

  return parsed
    .toLocaleString('en-US', {
      timeZone: PST_TIME_ZONE,
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    })
    .replace(',', '');
}

export function formatDatePST(
  input: string | Date | null | undefined,
  options?: { shortYear?: boolean; withLeadingZeros?: boolean }
): string {
  if (!input) return 'N/A';
  const dateKey = toPSTDateKey(input);
  if (!dateKey) return 'N/A';

  const [yearRaw, monthRaw, dayRaw] = dateKey.split('-').map(Number);
  const shortYear = options?.shortYear ?? false;
  const withLeadingZeros = options?.withLeadingZeros ?? false;
  const month = withLeadingZeros ? pad2(monthRaw) : String(monthRaw);
  const day = withLeadingZeros ? pad2(dayRaw) : String(dayRaw);
  const year = shortYear ? String(yearRaw).slice(-2) : String(yearRaw);

  return `${month}/${day}/${year}`;
}

export function formatTimePST(
  input: string | Date | null | undefined,
  options?: { withSeconds?: boolean }
): string {
  // Time-of-day display is 12-hour with AM/PM; delegate to the canonical 12h formatter.
  return formatTime12hPST(input, options);
}

/** Wall-clock time in America/Los_Angeles (12-hour with AM/PM). */
export function formatTime12hPST(
  input: string | Date | null | undefined,
  options?: { withSeconds?: boolean }
): string {
  const placeholder = '--:--';
  const withSeconds = options?.withSeconds ?? false;

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return placeholder;
    return new Intl.DateTimeFormat('en-US', {
      timeZone: PST_TIME_ZONE,
      hour: 'numeric',
      minute: '2-digit',
      ...(withSeconds ? { second: '2-digit' } : {}),
      hour12: true,
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

  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const min = pad2(m);
  if (withSeconds) {
    return `${h12}:${min}:${pad2(s)} ${period}`;
  }
  return `${h12}:${min} ${period}`;
}

/** Wall-clock HH:mm (24-hour, zero-padded) in America/Los_Angeles — no date, no seconds. */
export function formatClockTimePST(input: string | Date | null | undefined): string {
  const placeholder = '--:--';
  if (!input) return placeholder;

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return placeholder;
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: PST_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(input);
  }

  const raw = String(input).trim();
  if (!raw || raw === '1') return placeholder;

  const normalized = normalizePSTTimestamp(raw, { fallbackToNow: false });
  if (!normalized) return placeholder;

  const timePart = normalized.split(' ')[1];
  if (!timePart) return placeholder;

  const [hh, mm] = timePart.split(':');
  if (!hh || !mm) return placeholder;
  return `${hh}:${mm}`;
}

export function isSamePSTDate(
  a: string | Date | null | undefined,
  b: string | Date | null | undefined
): boolean {
  const keyA = toPSTDateKey(a);
  const keyB = toPSTDateKey(b);
  return !!keyA && !!keyB && keyA === keyB;
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

export function formatShortDate(dateString: string | null | undefined): string {
  if (!dateString) return 'N/A';

  try {
    const dateKey = toPSTDateKey(dateString);
    if (dateKey) {
      const [year, month, day] = dateKey.split('-').map(Number);
      return `${month}/${day}/${String(year).slice(-2)}`;
    }

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return 'Invalid Date';
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear().toString().slice(-2)}`;
  } catch {
    return 'Invalid Date';
  }
}

export function formatMonthDay(dateString: string | null | undefined): string | null {
  if (!dateString) return null;
  const dateKey = toPSTDateKey(dateString);
  if (dateKey) {
    const [, month, day] = dateKey.split('-').map(Number);
    if (!month || !day) return null;
    return `${month}/${day}`;
  }
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return null;
  const month = parsed.getMonth() + 1;
  const day = parsed.getDate();
  return `${month}/${day}`;
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

/** Tailwind text-color class based on days late. Accepts null for "no deadline" styling. */
export function getDaysLateTone(daysLate: number | null): string {
  if (daysLate === null) return 'text-text-soft';
  if (daysLate > 1) return 'text-red-600';
  if (daysLate === 1) return 'text-yellow-600';
  return 'text-emerald-600';
}

// ─── Week range helpers ─────────────────────────────────────────────────────

export interface WeekRange {
  start: Date;
  end: Date;
  startStr: string;
  endStr: string;
}

/**
 * Compute Sunday–Saturday civil date range for a week offset
 * (0 = warehouse week containing today, 1 = previous week, …).
 * `startStr` / `endStr` are YYYY-MM-DD civil keys (host-TZ independent).
 * `start` / `end` are local calendar Dates for legacy pickers only.
 */
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
