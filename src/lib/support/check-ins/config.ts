/**
 * Post-purchase check-in program knobs — one home, so the projection, the
 * sweep and the record agree on every delay.
 *
 * The program start is a hard gate: a milestone (delivered / picked up /
 * shipped) older than it never projects, so turning the program on cannot
 * flood the Support board with every historical order.
 */

export const SUPPORT_CHECK_IN_PROGRAM = 'post_purchase' as const;

/** Default program start; `SUPPORT_CHECK_IN_PROGRAM_START` (ISO instant) overrides it. */
export const SUPPORT_CHECK_IN_PROGRAM_START = '2026-10-04T00:00:00Z';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Delay from each milestone to the check-in being due, and the chase cadence after contact. */
export const SUPPORT_CHECK_IN_DELAYS_MS = {
  delivered: 2 * DAY_MS,
  picked_up: 2 * DAY_MS,
  /** Delivery never confirmed: check in this long after the carrier accepted / the box was scanned out. */
  shipped_fallback: 10 * DAY_MS,
  /** After a contact with no customer answer, the next follow-up falls due this much later. */
  chase: 3 * DAY_MS,
} as const;

/** Chases (contacts after the first while the customer stayed silent) before "Closed — no response" is offered. */
export const SUPPORT_CHECK_IN_MAX_CHASES = 1;

/** Support items the sweep opens per org per run (the rest wait for the next run). */
export const SUPPORT_CHECK_IN_OPEN_BATCH = 25;

/** Open check-in items the sweep re-derives per org per run. */
export const SUPPORT_CHECK_IN_REFRESH_BATCH = 200;

/** Program start as epoch ms: the env override when it parses, else the default. */
export function supportCheckInProgramStartMs(
  env: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const raw = String(env.SUPPORT_CHECK_IN_PROGRAM_START ?? '').trim();
  const parsed = raw ? Date.parse(raw) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Date.parse(SUPPORT_CHECK_IN_PROGRAM_START);
}
