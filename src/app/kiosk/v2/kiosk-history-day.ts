/**
 * The DAY BAND — how History cuts its rail into days.
 *
 * Callers: `KioskHistoryRail`. Affected API: none. Schemas: none — it takes the
 * already-PST-normalized `YYYY-MM-DD HH:MM:SS` string every counter reader
 * returns, the same input {@link kioskHistoryStamp} takes.
 * User 2026-09-23: *"there should be sticky date headers in the sidebar … so it
 * would display all of the dates and times insanely quickly and recognizably."*
 *
 * ## Why a band instead of a fuller stamp on every row
 *
 * Polaris' index tables and Square's iPad transaction list both do the same
 * thing: the DAY is factored out of the rows and pinned to the top of the
 * scroll box, so a column of forty rows carries forty times the clock and once
 * the date. Repeating `9/17/26` down every row spends the operator's reading on
 * the fact that changes least. The row keeps its time-first stamp; the band
 * answers "which day am I in" without the eye leaving the scroll position.
 *
 * ## Why this is string surgery, not `Date`
 *
 * Same law as `kiosk-history-stamp`: `normalizePSTTimestamp` has ALREADY
 * resolved the zone, so the leading ten characters ARE the civil day. Parsing
 * the string into a `Date` re-applies the runtime's zone, and on a tablet not
 * set to America/Los_Angeles that walks a late-evening drop-off into the next
 * day's band — a row filed under a date the paper in the operator's hand does
 * not carry.
 *
 * The only place a real zone question arises is `Today` / `Yesterday`, which
 * are relative to NOW rather than to the stored string. That resolves through
 * `getCurrentPSTDateKey()` — the warehouse-zone civil key the rest of the app
 * already uses — never through the tablet's own clock zone. Labels come from
 * the civil-key SoT in `@/utils/date`; this module invents no second formatter.
 */

import {
  addDaysToDateKey,
  diffDaysDateKey,
  formatDateKeyMedium,
  getCurrentPSTDateKey,
} from '@/utils/date';

/** Rows with no timestamp still need a band to live under. */
export const KIOSK_HISTORY_UNDATED_LABEL = 'No date recorded';

/**
 * The civil day a row belongs to — the first ten characters, validated.
 * Empty string when the row carries no usable timestamp.
 */
export function kioskHistoryDayKey(raw: string | null | undefined): string {
  const value = (raw ?? '').trim();
  if (value.length < 10) return '';
  const key = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : '';
}

/**
 * What the band prints.
 *
 * `Today` and `Yesterday` are the two the counter reads by name; every older
 * day gets its weekday, because "was that Friday or Saturday?" is the question
 * an operator actually asks about last week. The year appears only when it is
 * not the current one — printing `2026` on every band of a book that is almost
 * entirely this year is a column of noise.
 *
 * `todayKey` is injectable so the boundary is testable without moving a clock.
 */
export function kioskHistoryDayLabel(dayKey: string, todayKey?: string): string {
  if (!dayKey) return KIOSK_HISTORY_UNDATED_LABEL;
  const today = todayKey || getCurrentPSTDateKey();
  if (today) {
    if (dayKey === today) return 'Today';
    if (dayKey === addDaysToDateKey(today, -1)) return 'Yesterday';
  }
  const sameYear = Boolean(today) && dayKey.slice(0, 4) === today.slice(0, 4);
  return formatDateKeyMedium(dayKey, { weekday: 'long', withYear: !sameYear });
}

const DAYS_PER_WEEK = 7;
const DAYS_PER_MONTH = 30;
const DAYS_PER_YEAR = 365;

function unitsAgo(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
}

/**
 * How long ago the band's day was — `6 days ago`, `3 weeks ago`,
 * `2 months ago` — printed at the band's right edge.
 *
 * A weekday and a date answer WHEN; they do not answer HOW LONG, and on a book
 * of walk-ins HOW LONG is the triage question: `Pending Repair` under
 * `Friday, Jul 10` only reads as "on the bench for two months" after the
 * operator does calendar arithmetic. Shopify's admin prints the same relative
 * grammar beside an order date for the same reason.
 *
 * Whole CIVIL days between two warehouse date keys — never an elapsed-ms
 * `Date` subtraction, which would move the boundary with the tablet's zone.
 * Empty for `Today` / `Yesterday` (the label already IS relative), for an
 * undated band, and for a day after today (a clock the tablet disagrees with
 * is not an age).
 */
export function kioskHistoryDayAge(dayKey: string, todayKey?: string): string {
  if (!dayKey) return '';
  const days = diffDaysDateKey(dayKey, todayKey || getCurrentPSTDateKey());
  if (days == null || days < 2) return '';
  if (days < 2 * DAYS_PER_WEEK) return unitsAgo(days, 'day');
  if (days < 2 * DAYS_PER_MONTH) return unitsAgo(Math.floor(days / DAYS_PER_WEEK), 'week');
  if (days < DAYS_PER_YEAR) return unitsAgo(Math.floor(days / DAYS_PER_MONTH), 'month');
  return unitsAgo(Math.floor(days / DAYS_PER_YEAR), 'year');
}

export interface KioskHistoryDayBand<TRow> {
  dayKey: string;
  label: string;
  /** `6 days ago` — empty when the label is already relative. */
  age: string;
  rows: TRow[];
}

/**
 * Cut an ALREADY-ORDERED list into consecutive day bands.
 *
 * Consecutive, never grouped: the rail is a keyset page ordered on
 * `(created_at, source, id)` and a `Map` bucket would silently re-order it.
 * A day that somehow appeared twice in the stream would print twice — which is
 * the honest rendering of a list that is not sorted the way it claims.
 */
export function kioskHistoryDayBands<TRow>(
  rows: readonly TRow[],
  getTimestamp: (row: TRow) => string | null | undefined,
  todayKey?: string,
): KioskHistoryDayBand<TRow>[] {
  const today = todayKey || getCurrentPSTDateKey();
  const bands: KioskHistoryDayBand<TRow>[] = [];
  for (const row of rows) {
    const dayKey = kioskHistoryDayKey(getTimestamp(row));
    const last = bands[bands.length - 1];
    if (last && last.dayKey === dayKey) {
      last.rows.push(row);
      continue;
    }
    bands.push({
      dayKey,
      label: kioskHistoryDayLabel(dayKey, today),
      age: kioskHistoryDayAge(dayKey, today),
      rows: [row],
    });
  }
  return bands;
}
