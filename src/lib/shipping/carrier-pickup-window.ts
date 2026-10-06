/**
 * Carrier windows measured from the hand-off (the package left the dock):
 *
 * - NO MOVEMENT (operator 2026-10-05): a tracked package with no carrier scan
 *   is "awaiting pickup" for 1 warehouse business day (Mon–Fri,
 *   America/Los_Angeles) after hand-off, then "no movement". Business time is
 *   counted, not calendar time: Friday 15:00 → Monday 15:00; a weekend
 *   hand-off starts counting Monday 00:00 → Tuesday 00:00. Basis: carriers scan
 *   at pickup the same or next business day; Amazon Valid Tracking requires a
 *   physical carrier scan.
 * - CLAIM WINDOW (lost package), calendar days from mailing / hand-off:
 *   USPS opens after 15 days (Priority Mail Express 7) and closes at 60
 *   (usps.com/help/claims.htm); UPS (tariff) and FedEx: within 60 days.
 *   Other carriers: unknown → null.
 */

import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { addDaysToDateKey, weekdayOfDateKey, WAREHOUSE_TIME_ZONE } from '@/utils/date';

/** Business days a tracked package may wait for its first carrier scan before it reads "no movement". */
export const NO_MOVEMENT_BUSINESS_DAYS = 1;

const DAY_MS = 86_400_000;

const isBusinessDay = (dateKey: string): boolean => {
  const weekday = weekdayOfDateKey(dateKey);
  return weekday !== null && weekday >= 1 && weekday <= 5;
};

/**
 * The instant `businessDays` warehouse business days after `handOff`: the
 * same PT wall clock that many business days later (a weekend hand-off
 * starts at the next Monday 00:00 PT).
 */
export function addWarehouseBusinessDays(handOff: Date, businessDays: number = NO_MOVEMENT_BUSINESS_DAYS): Date {
  let day = formatInTimeZone(handOff, WAREHOUSE_TIME_ZONE, 'yyyy-MM-dd');
  let clock = formatInTimeZone(handOff, WAREHOUSE_TIME_ZONE, 'HH:mm:ss.SSS');
  if (!isBusinessDay(day)) {
    while (!isBusinessDay(day)) day = addDaysToDateKey(day, 1);
    clock = '00:00:00.000';
  }
  for (let added = 0; added < businessDays; ) {
    day = addDaysToDateKey(day, 1);
    if (isBusinessDay(day)) added += 1;
  }
  return fromZonedTime(`${day}T${clock}`, WAREHOUSE_TIME_ZONE);
}

/** True once a package handed off at `handOff` has had its business day(s) to be scanned, as of `now`. */
export function pickupWindowElapsed(handOff: Date, now: Date, businessDays: number = NO_MOVEMENT_BUSINESS_DAYS): boolean {
  return now.getTime() >= addWarehouseBusinessDays(handOff, businessDays).getTime();
}

/** A carrier's lost-package claim window: file on/after `opensAt`, before `closesAt` (ISO instants). */
export interface CarrierClaimWindow {
  opensAt: string;
  closesAt: string;
}

/** Calendar days from hand-off: when a lost-package claim may be filed, and its deadline. */
const CLAIM_DAYS: Readonly<Record<string, { opens: number; closes: number }>> = {
  USPS: { opens: 15, closes: 60 },
  UPS: { opens: 0, closes: 60 },
  FEDEX: { opens: 0, closes: 60 },
};
const USPS_EXPRESS_OPENS = 7;

/** The claim window for a package handed off at `handOff`; null when the carrier's window is not known. */
export function carrierClaimWindow(
  carrier: string | null | undefined,
  handOff: Date,
  service?: string | null,
): CarrierClaimWindow | null {
  const code = String(carrier ?? '').trim().toUpperCase();
  const days = CLAIM_DAYS[code];
  if (!days || Number.isNaN(handOff.getTime())) return null;
  const express = code === 'USPS' && /express/i.test(String(service ?? ''));
  const opens = express ? USPS_EXPRESS_OPENS : days.opens;
  return {
    opensAt: new Date(handOff.getTime() + opens * DAY_MS).toISOString(),
    closesAt: new Date(handOff.getTime() + days.closes * DAY_MS).toISOString(),
  };
}
