/**
 * Session duration and the gaps between sessions — PURE FUNCTIONS OVER ROWS.
 *
 * Zero DB, zero clock reads, zero imports outside ./types. Every input is a row
 * the caller already fetched and every "now" is a parameter, so the whole
 * module unit-tests without a database and without faking time. The tenant-
 * scoped reader that feeds it is ./session-rollup.ts.
 *
 * This answers the two questions the operator asked, which are NOT the same
 * question and must never be added together:
 *
 *   • how long did the work take   → {@link activeDuration}  (session, minus parks)
 *   • how long between sessions    → {@link gapBetween}      (ended_at → started_at)
 *
 * ── FIVE RULES THIS MODULE ENCODES ──────────────────────────────────────────
 *
 * 1. AN OPEN SESSION HAS NO DURATION. It has an elapsed-so-far, and every value
 *    derived from a running session is returned `provisional: true`. Nothing
 *    here ever substitutes `now()` for a missing `ended_at` and then presents
 *    the result as final — a supervisor comparing "2h 14m" against a finished
 *    session's "2h 14m" would be comparing a measurement to a guess.
 *
 * 2. A GAP BEFORE THE FIRST SESSION OF A SHIFT IS NOT A GAP. {@link gapBetween}
 *    returns null when there is no previous session, and {@link sessionSeries}
 *    interleaves nothing ahead of the first entry. The alternative — measuring
 *    from midnight, or from the shift start — invents idle time out of the fact
 *    that a report has to begin somewhere.
 *
 * 3. A GAP THAT SPANS A SHIFT BOUNDARY IS OFF-CLOCK, NOT IDLE. This is the rule
 *    with teeth. Two sessions on consecutive days are ~16 hours apart, and a
 *    report that files that as idle time accuses someone of doing nothing
 *    overnight. {@link classifyGap} consults the payroll punches and any moment
 *    of the gap not covered by an open punch makes the whole gap 'off-clock'.
 *    When punches are unavailable the gap is 'unknown' — never 'idle' by
 *    default, because the defaulting direction is the accusation.
 *
 * 4. CLOCKS DO NOT MIX. Interval `startedAt`/`endedAt` and session
 *    `startedAt`/`endedAt` are DB-clock values (every writer passes `now()`).
 *    Event `occurredAt` is deliberately CLIENT-minted at scan time so an async
 *    burst reports in scan order rather than arrival order
 *    (./scan-write-order.ts). Those are different clocks and a handheld five
 *    minutes fast would produce negative durations if they were crossed — so
 *    nothing in this file reads an event timestamp, and `dbNow` is a required
 *    parameter rather than a `Date.now()` fallback.
 *
 * 5. UNMEASURED IS NOT ZERO. A session with no interval rows returns
 *    `measured: false` alongside `ms: 0`. Rendering that as "0m" is a lie about
 *    a session nobody instrumented; the flag lets a UI say "—" instead.
 *
 * ── WHAT IS DELIBERATELY ABSENT ─────────────────────────────────────────────
 *
 * No formatting. No "2h 14m". A duration is a number of milliseconds plus the
 * flags that say how much to trust it; turning that into operator-facing text
 * is the caller's locale problem, and a formatter here would be the one import
 * that drags this module's consumers into a i18n graph.
 */

import type {
  SessionStatus,
  WorkSession,
  WorkSessionInterval,
} from './types';

// ── Duration ────────────────────────────────────────────────────────────────

/**
 * A measured span.
 *
 * The two flags are the whole point. `ms` alone cannot distinguish "this took
 * no time", "this is still running and has taken this long so far", and "no
 * rows exist so I do not know" — and those three render completely differently.
 */
export interface Duration {
  ms: number;
  /** Still running: `ms` is elapsed-so-far, measured to `dbNow`, not final. */
  provisional: boolean;
  /** False = no interval rows covered this span; `ms` is 0 because it is unknown. */
  measured: boolean;
}

const ZERO_UNMEASURED: Duration = Object.freeze({ ms: 0, provisional: false, measured: false });

function ms(at: string): number {
  return Date.parse(at);
}

/** Sum one interval's length, closing an open one at `dbNow`. */
function spanOf(interval: WorkSessionInterval, dbNow: string): number | null {
  const from = ms(interval.startedAt);
  const to = interval.endedAt === null ? ms(dbNow) : ms(interval.endedAt);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  // Clamp rather than return a negative. `work_session_intervals_order_chk`
  // forbids ended_at < started_at at the DB, so a negative here means an
  // unparseable or hand-edited row, and a negative summand would quietly
  // shorten the total instead of showing up.
  return Math.max(0, to - from);
}

function foldIntervals(
  intervals: readonly WorkSessionInterval[],
  sessionId: number,
  kind: WorkSessionInterval['kind'],
  dbNow: string,
): Duration {
  let total = 0;
  let provisional = false;
  let measured = false;

  for (const interval of intervals) {
    if (interval.sessionId !== sessionId || interval.kind !== kind) continue;
    const span = spanOf(interval, dbNow);
    if (span === null) continue;
    measured = true;
    total += span;
    if (interval.endedAt === null) provisional = true;
  }

  return measured ? { ms: total, provisional, measured: true } : ZERO_UNMEASURED;
}

/**
 * Time this session was actually being worked: the sum of its 'active'
 * intervals. Parked stretches are excluded by construction rather than
 * subtracted, so a session parked twice needs no arithmetic to stay correct.
 *
 * `dbNow` closes any still-open interval and is REQUIRED — see rule 4. Pass a
 * server-minted timestamp; a client clock here produces durations that disagree
 * between two browsers looking at the same session.
 */
export function activeDuration(
  session: Pick<WorkSession, 'id'>,
  intervals: readonly WorkSessionInterval[],
  dbNow: string,
): Duration {
  return foldIntervals(intervals, session.id, 'active', dbNow);
}

/** Time this session sat parked. Not work time, and never folded into it. */
export function parkedDuration(
  session: Pick<WorkSession, 'id'>,
  intervals: readonly WorkSessionInterval[],
  dbNow: string,
): Duration {
  return foldIntervals(intervals, session.id, 'parked', dbNow);
}

/**
 * `ended_at − started_at` — the session's wall clock, parks included.
 *
 * Kept alongside the other two because it is the checkable one:
 * active + parked should equal wall, and a drift between them means intervals
 * stopped tiling (a writer that opened without closing, or a row lost). It is
 * NOT the number to show an operator as "how long this took" — that is
 * {@link activeDuration}.
 */
export function wallDuration(
  session: Pick<WorkSession, 'startedAt' | 'endedAt'>,
  dbNow: string,
): Duration {
  const from = ms(session.startedAt);
  const open = session.endedAt === null;
  const to = open ? ms(dbNow) : ms(session.endedAt as string);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return ZERO_UNMEASURED;
  return { ms: Math.max(0, to - from), provisional: open, measured: true };
}

// ── Gaps ────────────────────────────────────────────────────────────────────

/**
 * What the space between two sessions MEANS.
 *
 * 'unknown' exists so the module never has to guess. A gap with no payroll
 * context is not idle time that we happen to lack evidence for — it is a span
 * whose meaning we do not know, and saying so is cheap while saying "idle" is
 * an accusation.
 */
export type GapClassification = 'idle' | 'off-clock' | 'unknown';

export interface SessionGap {
  /** The session the gap runs FROM (its `ended_at`). */
  fromSessionId: number;
  /** The session the gap runs TO (its `started_at`). */
  toSessionId: number;
  from: string;
  to: string;
  ms: number;
  classification: GapClassification;
}

/**
 * One payroll punch window. `punchedOutAt: null` = still clocked in.
 *
 * Shape only — `time_punches` is a payroll table and this module never reads
 * it. SESSION TIME AND CLOCK TIME ARE DIFFERENT NUMBERS: a punch says someone
 * was at work, a session says someone was doing a specific unit of work, and a
 * UI that presents one as the other will eventually claim a person worked eight
 * hours because a browser tab stayed open.
 */
export interface TimePunchWindow {
  punchedInAt: string;
  punchedOutAt: string | null;
}

function coversWholeSpan(
  punches: readonly TimePunchWindow[],
  from: number,
  to: number,
  dbNow: string,
): boolean {
  // Walk the punches in order and advance a cursor. The span is covered only if
  // the cursor reaches `to` without ever finding a hole — one uncovered
  // millisecond is enough to make the gap off-clock, which is the safe
  // direction (see rule 3).
  const windows = punches
    .map((p) => ({
      in: ms(p.punchedInAt),
      out: p.punchedOutAt === null ? ms(dbNow) : ms(p.punchedOutAt),
    }))
    .filter((w) => Number.isFinite(w.in) && Number.isFinite(w.out))
    .sort((a, b) => a.in - b.in);

  let cursor = from;
  for (const w of windows) {
    if (w.in > cursor) break;      // hole before this punch starts
    if (w.out > cursor) cursor = w.out;
    if (cursor >= to) return true;
  }
  return cursor >= to;
}

/**
 * Classify a span between two sessions.
 *
 * `punches: null` (not merely empty) means "payroll was not consulted" and
 * yields 'unknown'. An EMPTY array is a real answer — the staffer had no punch
 * covering this span — and yields 'off-clock'.
 */
export function classifyGap(
  from: string,
  to: string,
  punches: readonly TimePunchWindow[] | null,
  dbNow: string,
): GapClassification {
  if (punches === null) return 'unknown';
  const start = ms(from);
  const end = ms(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 'idle';
  return coversWholeSpan(punches, start, end, dbNow) ? 'idle' : 'off-clock';
}

/**
 * The span between one session ending and the next starting — the metric the
 * operator named ("how long it took from session to session").
 *
 * Returns null, not a zero Duration, for the three cases that are NOT gaps:
 *
 *   • there is no previous session (rule 2 — the first session of a shift);
 *   • the previous session has not ended, so there is nothing to measure from;
 *   • the next session started before the previous one ended (overlapping work
 *     on two benches). A negative gap is not a short gap; it is a different
 *     situation, and reporting it as 0 would hide concurrency.
 */
export function gapBetween(
  previousSession: Pick<WorkSession, 'id' | 'endedAt'> | null | undefined,
  nextSession: Pick<WorkSession, 'id' | 'startedAt'>,
  punches: readonly TimePunchWindow[] | null,
  dbNow: string,
): SessionGap | null {
  if (!previousSession || previousSession.endedAt === null) return null;

  const from = previousSession.endedAt;
  const to = nextSession.startedAt;
  const span = ms(to) - ms(from);
  if (!Number.isFinite(span) || span < 0) return null;

  return {
    fromSessionId: previousSession.id,
    toSessionId: nextSession.id,
    from,
    to,
    ms: span,
    classification: classifyGap(from, to, punches, dbNow),
  };
}

// ── Series ──────────────────────────────────────────────────────────────────

/** One session with everything derived about it. */
export interface SessionMetric {
  sessionId: number;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  /** Whose session it is. Per-stretch attribution is on the intervals. */
  staffId: number | null;
  active: Duration;
  parked: Duration;
  wall: Duration;
  /**
   * The gap BEFORE this session, or null for the first entry in the series.
   * Attached to the session it precedes rather than emitted as its own list
   * item so a table row can render "idle 14m ↓" above the session without the
   * caller re-zipping two arrays.
   */
  gapBefore: SessionGap | null;
  /**
   * Distinct staff who worked any stretch of this session. Length > 1 means the
   * session was handed over — the case `claimedByStaffId` exists for, and the
   * one a per-session `staffId` alone reports wrongly.
   */
  workedByStaffIds: number[];
}

export interface SessionSeriesInput {
  sessions: readonly WorkSession[];
  intervals: readonly WorkSessionInterval[];
  /** null = payroll not consulted; gaps come back 'unknown' rather than 'idle'. */
  punches?: readonly TimePunchWindow[] | null;
  /** Server-minted. Closes open intervals and open punches. */
  dbNow: string;
}

/**
 * Order the sessions oldest-first and derive every metric, interleaving the
 * gap between each pair.
 *
 * ORDERING IS BY `startedAt`, TIES BROKEN BY `id`. Never by array position —
 * the rollup reads newest-first for pagination and the caller would otherwise
 * get gaps computed backwards, which produces negative spans that rule 2's
 * null-return then swallows silently.
 */
export function sessionSeries(input: SessionSeriesInput): SessionMetric[] {
  const { intervals, dbNow } = input;
  const punches = input.punches ?? null;

  const ordered = [...input.sessions].sort((a, b) => {
    const delta = ms(a.startedAt) - ms(b.startedAt);
    return delta !== 0 ? delta : a.id - b.id;
  });

  const out: SessionMetric[] = [];
  let previous: WorkSession | null = null;

  for (const session of ordered) {
    const worked = new Set<number>();
    for (const interval of intervals) {
      if (interval.sessionId === session.id && interval.staffId != null) {
        worked.add(interval.staffId);
      }
    }

    out.push({
      sessionId: session.id,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      staffId: session.staffId,
      active: activeDuration(session, intervals, dbNow),
      parked: parkedDuration(session, intervals, dbNow),
      wall: wallDuration(session, dbNow),
      gapBefore: gapBetween(previous, session, punches, dbNow),
      workedByStaffIds: [...worked].sort((a, b) => a - b),
    });
    previous = session;
  }

  return out;
}

/**
 * Roll a series up into the numbers a per-staff report prints.
 *
 * Provisional durations are counted but the totals carry the flag forward: a
 * shift with one session still running has a total that will grow, and a
 * report that presented it as final would be wrong by however long the operator
 * keeps working. Off-clock gaps are summed SEPARATELY from idle ones and never
 * added together — that separation is the entire point of rule 3.
 */
export interface SessionSeriesTotals {
  sessionCount: number;
  active: Duration;
  parked: Duration;
  idleBetween: Duration;
  offClockBetween: Duration;
  /** Gaps whose meaning could not be determined (no payroll context). */
  unknownBetween: Duration;
}

export function seriesTotals(series: readonly SessionMetric[]): SessionSeriesTotals {
  const sum = (pick: (m: SessionMetric) => Duration): Duration => {
    let total = 0;
    let provisional = false;
    let measured = false;
    for (const metric of series) {
      const duration = pick(metric);
      if (!duration.measured) continue;
      measured = true;
      total += duration.ms;
      provisional ||= duration.provisional;
    }
    return measured ? { ms: total, provisional, measured: true } : ZERO_UNMEASURED;
  };

  const gapSum = (classification: GapClassification): Duration => {
    let total = 0;
    let measured = false;
    for (const metric of series) {
      if (metric.gapBefore?.classification !== classification) continue;
      measured = true;
      total += metric.gapBefore.ms;
    }
    return measured ? { ms: total, provisional: false, measured: true } : ZERO_UNMEASURED;
  };

  return {
    sessionCount: series.length,
    active: sum((m) => m.active),
    parked: sum((m) => m.parked),
    idleBetween: gapSum('idle'),
    offClockBetween: gapSum('off-clock'),
    unknownBetween: gapSum('unknown'),
  };
}
