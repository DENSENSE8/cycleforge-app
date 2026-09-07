/**
 * The desk Stack — the left column's four bands, as data.
 *
 * Pure by contract: no React, no DOM, no fetch, no import outside this folder.
 * The rail render (G4b) consumes this; the shell owns the clock and passes
 * `now` in, so the same input always folds to the same model.
 *
 * The bands are fixed and always all four — Now · Earlier · Queues · Find.
 * An empty shift still paints the column: staff learn the shape once, and a
 * band that disappears when it is empty is a shape they have to relearn every
 * morning. Emptiness is `block: null` / `blocks: []`, not a missing band.
 *
 * Elapsed is the SUM of a block's intervals, not `now - firstStart`: a block
 * parked at 10:00 and resumed at 14:00 carries the work, not the gap. See
 * `work_session_intervals` (`@/lib/sessions/types`) for the row this mirrors —
 * the shape is restated here rather than imported to keep the module free of
 * the sessions dependency graph.
 */

/** One stretch of wall clock on a block. `endedAt` null = running right now. */
export interface StackInterval {
  startedAt: string;
  endedAt: string | null;
}

/** A session block as the shell holds it, before the fold. */
export interface StackBlockInput {
  id: string;
  title: string;
  state: string;
  intervals: readonly StackInterval[];
}

/** A queue row — a Card list the Stack can open by table id. */
export interface StackQueue {
  id: string;
  label: string;
  tableId: string;
}

export interface StackModelInput {
  /** The block the desk is on right now, or null when nothing is armed. */
  armed: StackBlockInput | null;
  /** Every other block from the shift, in any order. */
  earlier: readonly StackBlockInput[];
  queues: readonly StackQueue[];
  /** The shell's clock, ISO. Open intervals are measured to here. */
  now: string;
}

/** A block folded for paint: identity, state, and the time it has taken. */
export interface StackBlock {
  id: string;
  title: string;
  state: string;
  /** Sum of interval lengths; open intervals run to `input.now`. */
  elapsedMs: number;
  /** True when some interval is still open — the block is on the clock. */
  running: boolean;
  /** Start of the block's latest interval; null when it has none. */
  lastStartedAt: string | null;
}

export type StackNowBand = { kind: 'now'; block: StackBlock | null };
export type StackEarlierBand = { kind: 'earlier'; blocks: StackBlock[] };
export type StackQueuesBand = { kind: 'queues'; queues: StackQueue[] };
export type StackFindBand = { kind: 'find' };

export type StackBand =
  | StackNowBand
  | StackEarlierBand
  | StackQueuesBand
  | StackFindBand;

export interface StackModel {
  /** Always these four, always in this order. */
  bands: [StackNowBand, StackEarlierBand, StackQueuesBand, StackFindBand];
}

/** Resume intent: arm one block, park whatever held the desk. */
export interface StackResume {
  arm: string;
  /** The block being displaced, or null when the desk was empty. */
  park: string | null;
}

function toMs(iso: string | null | undefined): number | null {
  if (typeof iso !== 'string' || iso === '') return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Sum of interval lengths. An open interval runs to `now`; a length that comes
 * out negative (clock skew, or an interval that starts after `now`) counts as
 * zero rather than eating another interval's time.
 */
function elapsedMs(intervals: readonly StackInterval[], nowMs: number | null): number {
  let total = 0;
  for (const interval of intervals) {
    const start = toMs(interval.startedAt);
    if (start === null) continue;
    const end = interval.endedAt === null ? nowMs : toMs(interval.endedAt);
    if (end === null) continue;
    total += Math.max(0, end - start);
  }
  return total;
}

/**
 * Latest interval start on the block, as epoch ms and as the caller's own ISO
 * string; both null when the block has no parseable interval. Read by max
 * rather than by array position — the shell is free to hand intervals over in
 * any order.
 */
function lastStart(intervals: readonly StackInterval[]): {
  ms: number | null;
  iso: string | null;
} {
  let ms: number | null = null;
  let iso: string | null = null;
  for (const interval of intervals) {
    const start = toMs(interval.startedAt);
    if (start === null) continue;
    if (ms === null || start > ms) {
      ms = start;
      iso = interval.startedAt;
    }
  }
  return { ms, iso };
}

function foldBlock(block: StackBlockInput, nowMs: number | null): StackBlock {
  const intervals = block.intervals;
  return {
    id: block.id,
    title: block.title,
    state: block.state,
    elapsedMs: elapsedMs(intervals, nowMs),
    running: intervals.some((interval) => interval.endedAt === null),
    lastStartedAt: lastStart(intervals).iso,
  };
}

/**
 * Fold the shift into the four bands.
 *
 * `earlier` comes back newest-first by each block's latest interval start —
 * what staff reach for is what they just left. Blocks with no interval at all
 * sink to the bottom; ties keep input order.
 */
export function stackModel(input: StackModelInput): StackModel {
  const nowMs = toMs(input.now);
  const earlier = input.earlier
    .map((block, index) => ({ block, index, start: lastStart(block.intervals).ms }))
    .sort((a, b) => {
      if (a.start === b.start) return a.index - b.index;
      if (a.start === null) return 1;
      if (b.start === null) return -1;
      return b.start - a.start;
    })
    .map((entry) => foldBlock(entry.block, nowMs));

  return {
    bands: [
      { kind: 'now', block: input.armed ? foldBlock(input.armed, nowMs) : null },
      { kind: 'earlier', blocks: earlier },
      { kind: 'queues', queues: [...input.queues] },
      { kind: 'find' },
    ],
  };
}

/** The Now band, without the caller indexing into `bands`. */
export function armedBlock(model: StackModel): StackBlock | null {
  return model.bands[0].block;
}

/**
 * What arming `id` costs: the desk holds one block, so resuming parks the one
 * that had it. `park` is null when the desk was empty, and when `id` is already
 * armed — re-arming the current block is a no-op, not a park of itself.
 */
export function resumeBlock(model: StackModel, id: string): StackResume {
  const armed = armedBlock(model);
  return {
    arm: id,
    park: armed && armed.id !== id ? armed.id : null,
  };
}
