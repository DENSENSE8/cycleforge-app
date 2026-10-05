/**
 * Carrier pickup cutoffs — the time each carrier's truck leaves the dock, per
 * warehouse weekday (`carrier_pickup_cutoffs`). Pure and client-safe: the
 * carrier key, the weekday vocabulary, and the day resolver the server store
 * and the settings editor share.
 */

import { warehouseCivilTimeToInstant, weekdayOfDateKey } from '@/utils/date';

/** Warehouse weekday, 0 = Sunday … 6 = Saturday (`weekdayOfDateKey`). */
export type PickupWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const PICKUP_WEEKDAYS: ReadonlyArray<{ weekday: PickupWeekday; short: string }> = [
  { weekday: 1, short: 'Mon' },
  { weekday: 2, short: 'Tue' },
  { weekday: 3, short: 'Wed' },
  { weekday: 4, short: 'Thu' },
  { weekday: 5, short: 'Fri' },
  { weekday: 6, short: 'Sat' },
  { weekday: 0, short: 'Sun' },
];

/** Monday–Friday — the "same time every weekday" fill. */
export const PICKUP_WORKWEEK: ReadonlyArray<PickupWeekday> = [1, 2, 3, 4, 5];

/** 24-hour wall clock `HH:MM`. */
export const PICKUP_CUTOFF_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** One configured cutoff: `carrier` already normalized, `cutoffLocal` `HH:MM` in the warehouse zone. */
export interface PickupCutoffRow {
  carrier: string;
  weekday: PickupWeekday;
  cutoffLocal: string;
}

/** A cutoff resolved onto one warehouse day. */
export interface PickupCutoffOfDay {
  carrier: string;
  /** `HH:MM`, warehouse wall clock. */
  cutoffLocal: string;
  /** The cutoff on that warehouse day, as an ISO instant. */
  cutoffAt: string;
}

/**
 * The carrier key: trimmed and upper-cased, blank → null. Matches the Live feed
 * board's `UPPER(BTRIM(shipping_tracking_numbers.carrier))` exactly, so a
 * cutoff joins 1:1 with the board's carrier groups.
 */
export function normalizePickupCarrier(raw: string | null | undefined): string | null {
  const key = String(raw ?? '').trim().toUpperCase();
  return key ? key : null;
}

/**
 * The cutoffs that fall on warehouse day `dateKey` (`YYYY-MM-DD`), each as the
 * instant that wall-clock time reaches in the warehouse zone that day (DST
 * resolved per day), earliest first. An invalid key yields none.
 */
export function pickupCutoffsForDay(rows: ReadonlyArray<PickupCutoffRow>, dateKey: string): PickupCutoffOfDay[] {
  const weekday = weekdayOfDateKey(dateKey);
  if (weekday === null) return [];
  const out: PickupCutoffOfDay[] = [];
  for (const row of rows) {
    if (row.weekday !== weekday) continue;
    const instant = warehouseCivilTimeToInstant(dateKey, row.cutoffLocal);
    if (!instant) continue;
    out.push({ carrier: row.carrier, cutoffLocal: row.cutoffLocal, cutoffAt: instant.toISOString() });
  }
  return out.sort((a, b) => a.cutoffAt.localeCompare(b.cutoffAt) || a.carrier.localeCompare(b.carrier));
}
