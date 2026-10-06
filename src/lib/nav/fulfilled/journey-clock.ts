/**
 * The JOURNEY CLOCK face (operator 2026-10-05): every Fulfilled row carries
 * when its current bucket started (`clock.since`) and when it breaches that
 * bucket's threshold (`clock.due`, null = no threshold). This turns the pair
 * into what the board card, the sheet cell and the phone card paint — the age,
 * the threshold, and how much of it is used — against the viewer's own now, so
 * the clock keeps ticking between fetches. Pure; one home for desk and phone.
 *
 * Tone: `calm` < 50% of the threshold, `near` 50–100%, `over` ≥ 100%,
 * `none` = no threshold (the bucket's own tone speaks).
 */

export interface JourneyClock {
  since: string;
  due: string | null;
}

export type JourneyClockTone = 'calm' | 'near' | 'over' | 'none';

export interface JourneyClockFace {
  /** Time in the bucket: `40m`, `5h`, `3d`. */
  age: string;
  /** The threshold's length (`3d`), null when the bucket has none. */
  limit: string | null;
  /** Share of the threshold used (1 = at the threshold); null without one. */
  ratio: number | null;
  tone: JourneyClockTone;
  /** Milliseconds in the bucket — ties on `ratio` sort by it. */
  ageMs: number;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** `40m` under an hour, `5h` under two days, else whole days `3d`. */
export function formatJourneySpan(ms: number): string {
  const span = Math.max(0, ms);
  if (span < HOUR_MS) return `${Math.max(1, Math.floor(span / MINUTE_MS))}m`;
  if (span < 2 * DAY_MS) return `${Math.floor(span / HOUR_MS)}h`;
  return `${Math.floor(span / DAY_MS)}d`;
}

export function journeyClockFace(clock: JourneyClock | null | undefined, now: number): JourneyClockFace | null {
  if (!clock) return null;
  const since = Date.parse(clock.since);
  if (!Number.isFinite(since)) return null;
  const ageMs = Math.max(0, now - since);
  const due = clock.due === null ? Number.NaN : Date.parse(clock.due);
  if (!Number.isFinite(due)) return { age: formatJourneySpan(ageMs), limit: null, ratio: null, tone: 'none', ageMs };
  const span = due - since;
  // A threshold at (or before) its own start is breached the moment it is reached.
  const ratio = span > 0 ? ageMs / span : now >= due ? Number.POSITIVE_INFINITY : 0;
  const tone: JourneyClockTone = ratio >= 1 ? 'over' : ratio >= 0.5 ? 'near' : 'calm';
  return { age: formatJourneySpan(ageMs), limit: span > 0 ? formatJourneySpan(span) : null, ratio, tone, ageMs };
}

/** A clock as its span: `3d / 1d` with a threshold, else the age alone; '' without a clock. */
export function journeyClockSpanText(face: JourneyClockFace | null): string {
  if (!face) return '';
  return face.limit ? `${face.age} / ${face.limit}` : face.age;
}

/**
 * Most urgent first: the larger share of the threshold used, then the older.
 * Rows without a threshold sort after every row with one, oldest first.
 */
export function compareJourneyUrgency(a: JourneyClockFace | null, b: JourneyClockFace | null): number {
  const ra = a?.ratio ?? -1;
  const rb = b?.ratio ?? -1;
  if (ra !== rb) return rb - ra;
  return (b?.ageMs ?? -1) - (a?.ageMs ?? -1);
}
