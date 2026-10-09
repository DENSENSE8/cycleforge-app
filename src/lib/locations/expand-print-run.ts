/**
 * Expand a bulk location-label run on one aisle: bays from–through, levels
 * from–through, each optionally odd-only or even-only, and an optional
 * position range. Walk order is bay, then level, then position. A run with
 * no position range prints `C-03-10-3` faces (position 0).
 */

import { locationCode, type LocationSegments } from '@/lib/barcode-routing';

const MAX_SEGMENT = 99;

/** The most labels one run may plan — a typo in a range must not plan thousands. */
export const MAX_RUN_LABELS = 500;

export type RunParity = 'all' | 'odd' | 'even';

export interface RunRange {
  from: number;
  through: number;
  parity: RunParity;
}

export interface ExpandRangeRunInput {
  zone: string;
  aisle: number;
  bays: RunRange;
  levels: RunRange;
  /** Null = no position on the face. */
  positions: { from: number; through: number } | null;
}

export type ExpandedPrintRunRow = {
  segments: LocationSegments;
  code: string;
};

export type RangeRunPlan =
  | { status: 'ok'; rows: ExpandedPrintRunRow[] }
  | { status: 'empty' }
  | { status: 'too_many'; count: number };

function clampSegment(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  const v = Math.floor(n);
  return v >= 1 && v <= MAX_SEGMENT ? v : null;
}

/** The values a range keeps, ascending; [] when either end is not a 1–99 segment. */
function rangeValues(range: { from: number; through: number; parity?: RunParity }): number[] {
  const from = clampSegment(range.from);
  const through = clampSegment(range.through);
  if (!from || !through) return [];
  const out: number[] = [];
  for (let n = Math.min(from, through); n <= Math.max(from, through); n += 1) {
    if (range.parity === 'odd' && n % 2 === 0) continue;
    if (range.parity === 'even' && n % 2 === 1) continue;
    out.push(n);
  }
  return out;
}

/** Every label the ranges name, or why there are none to print. */
export function expandRangePrintRun(input: ExpandRangeRunInput): RangeRunPlan {
  const zone = String(input.zone ?? '').trim().toUpperCase().charAt(0);
  const aisle = clampSegment(input.aisle);
  if (!/^[A-Z]$/.test(zone) || !aisle) return { status: 'empty' };

  const bays = rangeValues(input.bays);
  const levels = rangeValues(input.levels);
  const positions = input.positions ? rangeValues(input.positions) : [0];
  const count = bays.length * levels.length * positions.length;
  if (count === 0) return { status: 'empty' };
  if (count > MAX_RUN_LABELS) return { status: 'too_many', count };

  const rows: ExpandedPrintRunRow[] = [];
  for (const bay of bays) {
    for (const level of levels) {
      for (const position of positions) {
        const segments: LocationSegments = { zone, aisle, bay, level, position };
        rows.push({ segments, code: locationCode(segments) });
      }
    }
  }
  return { status: 'ok', rows };
}
