/**
 * The Live feed's pace and pickup arithmetic — ONE copy for the board's
 * strips (`PaceStrip`, `PickupStrip`) and the Operations TV wall's panel.
 * Pure and client-safe; callers pass the clock (`now`) so the server never
 * renders a time.
 */

import { WAREHOUSE_TIME_ZONE } from '@/utils/date';

const HOUR_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: WAREHOUSE_TIME_ZONE,
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
});

/** The warehouse wall clock as fractional hours (14.5 = 2:30 PM). */
export function warehouseClockHours(nowMs: number): number {
  const parts = Object.fromEntries(HOUR_PARTS.formatToParts(nowMs).map((part) => [part.type, part.value]));
  return Number(parts.hour) + Number(parts.minute) / 60;
}

/**
 * Today's scan-out rate per hour since the first scan-out, or null before the
 * dock's first scan-out. Never divides by under half an hour, so the first
 * few scans do not read as a sprint.
 */
export function pacePerHour(today: readonly number[], clockHours: number): number | null {
  const done = today.reduce((sum, n) => sum + n, 0);
  const firstHour = today.findIndex((n) => n > 0);
  if (done === 0 || firstHour < 0) return null;
  return done / Math.max(0.5, clockHours - firstHour);
}

/** Yesterday's scan-outs up to this time of day (the current hour pro-rated). */
export function yesterdayByNow(yesterday: readonly number[], clockHours: number): number {
  const hour = Math.floor(clockHours);
  const whole = yesterday.slice(0, hour).reduce((sum, n) => sum + n, 0);
  return Math.round(whole + (yesterday[hour] ?? 0) * (clockHours - hour));
}

export type PickupTone = 'calm' | 'soon' | 'urgent';

/** Amber inside the last hour; rose inside the last 30 minutes, or once the truck left with packages still here. */
export function pickupTone(msLeft: number, remaining: number): PickupTone {
  if (msLeft <= 0) return remaining > 0 ? 'urgent' : 'calm';
  if (msLeft < 30 * 60_000) return 'urgent';
  if (msLeft < 60 * 60_000) return 'soon';
  return 'calm';
}

/** `130` minutes → `2h 10m`; never under `1m`. */
export function formatDurationMinutes(minutes: number): string {
  const whole = Math.max(1, Math.round(minutes));
  if (whole < 60) return `${whole}m`;
  const h = Math.floor(whole / 60);
  const m = whole % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
