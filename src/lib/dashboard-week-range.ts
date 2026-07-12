import {
  addDaysToDateKey,
  dateKeyFromParts,
  getCurrentPSTDateKey,
  parseDateKey,
  weekdayOfDateKey,
} from '@/utils/date';

/**
 * Mon–Fri (warehouse) range for a week offset (0 = week containing anchor/today).
 * Civil-date arithmetic only — host TZ never shifts the keys.
 */
export function getWeekRangeForOffset(weekOffset: number, anchorDateKey?: string) {
  const baseDateKey =
    anchorDateKey && parseDateKey(anchorDateKey) ? anchorDateKey : getCurrentPSTDateKey();
  // JS: 0=Sun … 6=Sat. Monday-based: Sun→6 days back, Mon→0, …
  const dow = weekdayOfDateKey(baseDateKey) ?? 0;
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const mondayKey = addDaysToDateKey(baseDateKey, -daysFromMonday - weekOffset * 7);
  const fridayKey = addDaysToDateKey(mondayKey, 4);
  return {
    startStr: mondayKey,
    endStr: fridayKey,
  };
}

/**
 * Calendar-month range for an offset (0 = this month, 1 = last month, …),
 * first day → last day, civil keys in the warehouse frame.
 */
export function getMonthRangeForOffset(monthOffset: number, anchorDateKey?: string) {
  const baseDateKey =
    anchorDateKey && parseDateKey(anchorDateKey) ? anchorDateKey : getCurrentPSTDateKey();
  const parts = parseDateKey(baseDateKey);
  if (!parts) return { startStr: '', endStr: '' };

  // Month index 0-based after offset
  let y = parts.y;
  let m0 = parts.m - 1 - monthOffset;
  while (m0 < 0) {
    m0 += 12;
    y -= 1;
  }
  while (m0 > 11) {
    m0 -= 12;
    y += 1;
  }
  const startStr = dateKeyFromParts(y, m0 + 1, 1);
  // Day 0 of next month = last day of this month (UTC civil)
  const last = new Date(Date.UTC(y, m0 + 1, 0));
  const endStr = dateKeyFromParts(last.getUTCFullYear(), last.getUTCMonth() + 1, last.getUTCDate());
  return { startStr, endStr };
}

/** Monday of the ISO week containing `dateKey` (civil). */
function mondayOf(dateKey: string): string {
  const dow = weekdayOfDateKey(dateKey) ?? 0;
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  return addDaysToDateKey(dateKey, -daysFromMonday);
}

/**
 * Canonical Mon–Sun week buckets covering [startKey, endKey] inclusive.
 * Stable cache units shared across overlapping ranges.
 */
export function getWeekBucketsForRange(
  startKey: string,
  endKey: string,
): { weekStart: string; weekEnd: string }[] {
  if (!startKey || !endKey || !parseDateKey(startKey) || !parseDateKey(endKey)) return [];
  const buckets: { weekStart: string; weekEnd: string }[] = [];
  let cursor = mondayOf(startKey);
  const endMonday = mondayOf(endKey);
  let guard = 0;
  while (cursor <= endMonday && guard < 260) {
    buckets.push({
      weekStart: cursor,
      weekEnd: addDaysToDateKey(cursor, 6),
    });
    cursor = addDaysToDateKey(cursor, 7);
    guard += 1;
  }
  return buckets;
}

/** Monday (YYYY-MM-DD) of the current warehouse week — the immutability boundary. */
function getCurrentWeekStartKey(): string {
  return mondayOf(getCurrentPSTDateKey());
}

/** A week bucket is immutable once it starts strictly before the current week. */
export function isPastWeekStart(weekStartKey: string): boolean {
  return weekStartKey < getCurrentWeekStartKey();
}

/**
 * The current week + the previous `count - 1` weeks as Mon–Sun buckets (newest
 * first). Used to warm the cache on idle so common period presets resolve fast.
 */
export function getRecentWeekBuckets(count: number): { weekStart: string; weekEnd: string }[] {
  const cur = mondayOf(getCurrentPSTDateKey());
  const out: { weekStart: string; weekEnd: string }[] = [];
  for (let i = 0; i < Math.max(0, count); i++) {
    const mon = addDaysToDateKey(cur, -i * 7);
    out.push({ weekStart: mon, weekEnd: addDaysToDateKey(mon, 6) });
  }
  return out;
}
