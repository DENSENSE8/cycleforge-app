/**
 * Pure half of the throughput report (docs/loops/THROUGHPUT.md): pairing
 * start/end events into cycle times, percentiles, the receipt step shape and
 * the stdout table. No DB, no fs — `report.ts` owns the IO.
 */
import { createHash } from 'node:crypto';

export type EventRole = 'start' | 'end';

/** One row a step query returns: the subject key, which side of the step it is, and when. */
export interface StepEvent {
  key: string;
  role: EventRole;
  at: Date;
}

export interface Window {
  from: Date;
  to: Date;
}

export interface Pair {
  key: string;
  startAt: Date;
  endAt: Date;
  minutes: number;
}

/** Receipt row per step (AUTORESEARCH.md §5). `noData` carries the reason; never a guessed number. */
export interface StepResult {
  id: string;
  from: string;
  to: string;
  n: number;
  medianMin: number | null;
  p90Min: number | null;
  noData?: string;
}

export interface DailyCounts {
  day: string;
  cartonsUnboxed: number;
  unitsUnboxed: number;
  unitsTested: number;
  shipmentsPacked: number;
  shipmentsShipped: number;
}

/**
 * Per key: the EARLIEST start, then the earliest end at or after it. A key with
 * no start, or whose every end precedes its first start, is unpaired — never
 * guessed. Only pairs whose end lands in [from, to) are kept, so a step's n is
 * "subjects that finished the step inside the window".
 */
export function pairEvents(events: readonly StepEvent[], window: Window): Pair[] {
  const firstStart = new Map<string, number>();
  for (const e of events) {
    if (e.role !== 'start') continue;
    const t = e.at.getTime();
    const prev = firstStart.get(e.key);
    if (prev === undefined || t < prev) firstStart.set(e.key, t);
  }
  const firstEnd = new Map<string, number>();
  for (const e of events) {
    if (e.role !== 'end') continue;
    const start = firstStart.get(e.key);
    if (start === undefined) continue;
    const t = e.at.getTime();
    if (t < start) continue;
    const prev = firstEnd.get(e.key);
    if (prev === undefined || t < prev) firstEnd.set(e.key, t);
  }
  const from = window.from.getTime();
  const to = window.to.getTime();
  const pairs: Pair[] = [];
  for (const [key, end] of firstEnd) {
    if (end < from || end >= to) continue;
    const start = firstStart.get(key)!;
    pairs.push({ key, startAt: new Date(start), endAt: new Date(end), minutes: (end - start) / 60_000 });
  }
  return pairs.sort((a, b) => a.endAt.getTime() - b.endAt.getTime() || a.key.localeCompare(b.key));
}

/** Linear-interpolated percentile (Postgres `percentile_cont`) over ascending values; p in [0, 1]. */
export function percentile(sortedAsc: readonly number[], p: number): number {
  if (sortedAsc.length === 0) throw new Error('percentile: empty sample');
  if (p < 0 || p > 1) throw new Error(`percentile: p out of range: ${p}`);
  const rank = p * (sortedAsc.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (rank - lo);
}

const round1 = (x: number): number => Math.round(x * 10) / 10;

export interface StepMeta {
  id: string;
  from: string;
  to: string;
}

/** Summarize a measured step; zero pairs is `noData`, not a zero-minute median. */
export function measuredStep(meta: StepMeta, pairs: readonly Pair[]): StepResult {
  if (pairs.length === 0) {
    return { ...meta, n: 0, medianMin: null, p90Min: null, noData: `no ${meta.from} → ${meta.to} pair completed in the window` };
  }
  const sorted = pairs.map((p) => p.minutes).sort((a, b) => a - b);
  return {
    ...meta,
    n: sorted.length,
    medianMin: round1(percentile(sorted, 0.5)),
    p90Min: round1(percentile(sorted, 0.9)),
  };
}

/** A step with no trustworthy start/end pair in the schema: reported, never estimated. */
export function unmeasurableStep(meta: StepMeta, reason: string): StepResult {
  return { ...meta, n: 0, medianMin: null, p90Min: null, noData: reason };
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Minutes → compact human span (`42m`, `5.3h`, `2.1d`). */
export function formatMinutes(min: number | null): string {
  if (min === null) return '—';
  if (min < 120) return `${round1(min)}m`;
  if (min < 48 * 60) return `${round1(min / 60)}h`;
  return `${round1(min / 1440)}d`;
}

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: readonly string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd();
  return [line(header), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n');
}

export function formatReport(steps: readonly StepResult[], daily: readonly DailyCounts[]): string {
  const stepTable = table(
    ['step', 'n', 'median', 'p90', 'note'],
    steps.map((s) => [s.id, String(s.n), formatMinutes(s.medianMin), formatMinutes(s.p90Min), s.noData ? `no_data: ${s.noData}` : '']),
  );
  const dailyTable = table(
    ['day', 'cartons unboxed', 'units unboxed', 'units tested', 'shipments packed', 'shipments shipped'],
    daily.map((d) => [d.day, String(d.cartonsUnboxed), String(d.unitsUnboxed), String(d.unitsTested), String(d.shipmentsPacked), String(d.shipmentsShipped)]),
  );
  return `${stepTable}\n\n${dailyTable}`;
}
