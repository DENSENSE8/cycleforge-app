/**
 * Shared chrome for a mobile station's tape — the classes a row, a focus card
 * and a station header all have to agree on.
 *
 * Everything here was a literal repeated across three files before it was a
 * token. `tracking-[0.12em]`, `tracking-[0.16em]` and `tracking-[0.18em]` all
 * appeared as hand-written values on what is one typographic role (an uppercase
 * eyebrow), which is how three stations end up with three slightly different
 * label faces. One value, one place.
 */

import type { StationTone } from './station-tape';

/**
 * The uppercase micro-label face — outcome verbs, station titles, counters.
 *
 * No size, no weight, no letterspacing of its own any more.
 *
 * It used to be `font-semibold uppercase tracking-[0.14em]`, applied across four
 * different optical sizes. The house scale already encodes tracking per size —
 * `role-eyebrow` carries 0.08em at 11px and `role-micro` 0.04em at 10px — and a
 * single hand-picked value overrode both, so caps were over-tracked at 14px and
 * under-tracked at 10px. Pair this with `text-role-eyebrow` or
 * `text-role-micro` and let the token do its job.
 */
export const STATION_EYEBROW_CLASS = 'uppercase';

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
