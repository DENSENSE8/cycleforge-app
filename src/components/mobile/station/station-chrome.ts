/** Shared chrome for a mobile station's tape — the classes a row, a focus card and a station header all have to agree on. */

import type { StationTone } from './station-tape';

/**
 * Ink, for the one place tone still speaks in words: the server's own message.
 *
 * That line is `role-caption` and short, not a 10px stamp, so the semantic
 * tokens carry it — and they flip per theme, which the raw steps never did.
 */
export const STATION_TONE_INK: Record<StationTone, string> = {
  ok: 'text-text-success',
  warn: 'text-text-warning',
  bad: 'text-text-danger',
};
