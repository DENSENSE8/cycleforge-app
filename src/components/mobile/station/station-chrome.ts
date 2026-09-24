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
 * Tone as a GROUND, not as ink.
 *
 * The signal used to live in a 10px coloured stamp. Measured on the default
 * light theme over `bg-surface-card` #ffffff, `text-text-success` (then #16a34a) was
 * 3.26:1 and `text-text-warning` (then #ea580c) 3.54:1 — both under the 4.5:1 floor
 * for text this size, and the outcome verb had already been removed from the
 * row, so that ink WAS the entire distinction between "the job" and "stop and
 * look". A signal nobody can read is not a signal.
 *
 * Moving it to the row's ground fixes three things at once: contrast stops
 * depending on a tiny glyph, an exception becomes findable while scrolling a
 * 40-row ledger, and the outcome no longer relies on hue alone.
 */
export const STATION_TONE_GROUND: Record<StationTone, string> = {
  // The job. No tint — a ledger where every row is coloured has no signal.
  ok: 'bg-surface-card',
  warn: 'bg-surface-warning',
  bad: 'bg-surface-danger',
};

/**
 * The tone's edge — the focus row's top rule and the ring around its photo.
 *
 * `border-success|warning|danger`, not `emerald-500`/`amber-500`. The raw steps
 * were a different hue family from the semantic ink beside them (emerald is
 * teal-leaning against green-600; amber is yellow against orange-600), so one
 * row showed two greens that did not match.
 */
export const STATION_TONE_EDGE: Record<StationTone, string> = {
  ok: 'border-border-success',
  warn: 'border-border-warning',
  bad: 'border-border-danger',
};

export const STATION_TONE_RING: Record<StationTone, string> = {
  ok: 'ring-border-success',
  warn: 'ring-border-warning',
  bad: 'ring-border-danger',
};

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
