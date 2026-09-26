/** The DAY BAND — how History cuts its rail into days. */

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

/** What the band prints. */
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

/** How long ago the band's day was — `6 days ago`, `3 weeks ago`, `2 months ago` — printed at the band's right edge. */
export function kioskHistoryDayAge(dayKey: string, todayKey?: string): string {
  if (!dayKey) return '';
  const days = diffDaysDateKey(dayKey, todayKey || getCurrentPSTDateKey());
  if (days == null || days < 2) return '';
  if (days < 2 * DAYS_PER_WEEK) return unitsAgo(days, 'day');
  if (days < 2 * DAYS_PER_MONTH) return unitsAgo(Math.floor(days / DAYS_PER_WEEK), 'week');
  if (days < DAYS_PER_YEAR) return unitsAgo(Math.floor(days / DAYS_PER_MONTH), 'month');
  return unitsAgo(Math.floor(days / DAYS_PER_YEAR), 'year');
}

interface KioskHistoryDayBand<TRow> {
  dayKey: string;
  label: string;
  /** `6 days ago` — empty when the label is already relative. */
  age: string;
  rows: TRow[];
}

/** Cut an ALREADY-ORDERED list into consecutive day bands. */
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
