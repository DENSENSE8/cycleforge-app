/**
 * Expand a bay into one qty-bin per level (position 1) so a bulk print
 * identifies the exact level on every sticker.
 *
 * Floor talk `A1–A4` / `B1–B48` maps to bay 1 levels 1–4 and bay 2 levels 1–48
 * on the picked aisle. Zone letter comes from the room (C room → zone C).
 */

import { locationCode, type LocationSegments } from '@/lib/barcode-routing';

export type BayLevelRange = {
  /** 1-based bay number on the aisle (A → 1, B → 2). */
  bay: number;
  /** Walking letter printed in tests / logs (`A`, `B`). */
  letter: string;
  levelStart: number;
  levelEnd: number;
};

/**
 * Zone 3 Parts cabinets: bay A has 4 levels, bay B has 48.
 * Aisle is the operator pick (often 1 in a single-aisle room, or 3 if they
 * number aisles to match the zone).
 */
export const PARTS_DRAWER_BAY_LEVELS: readonly BayLevelRange[] = [
  { bay: 1, letter: 'A', levelStart: 1, levelEnd: 4 },
  { bay: 2, letter: 'B', levelStart: 1, levelEnd: 48 },
];

const MAX_SEGMENT = 99;

function clampSegment(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  const v = Math.floor(n);
  if (v < 1 || v > MAX_SEGMENT) return null;
  return v;
}

export function bayHandName(letter: string, level: number): string {
  return `${String(letter).trim().toUpperCase().charAt(0) || 'X'}${Math.floor(level)}`;
}

export type ExpandedBayLevel = {
  segments: LocationSegments;
  /** Floor name (`A1`, `B48`) — the QR still carries the 5-segment code. */
  hand: string;
};

/**
 * One qty bin per level at `position` (default 1). Skips invalid ranges.
 */
export function expandBayLevelSegments(opts: {
  zone: string;
  aisle: number;
  position?: number;
  bays: readonly BayLevelRange[];
}): ExpandedBayLevel[] {
  const aisle = clampSegment(opts.aisle);
  const position = clampSegment(opts.position ?? 1);
  const zone = String(opts.zone ?? '')
    .trim()
    .toUpperCase()
    .charAt(0);
  if (!aisle || !position || !/^[A-Z]$/.test(zone)) return [];

  const out: ExpandedBayLevel[] = [];
  for (const spec of opts.bays) {
    const bay = clampSegment(spec.bay);
    const start = clampSegment(spec.levelStart);
    const end = clampSegment(spec.levelEnd);
    if (!bay || !start || !end) continue;
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    for (let level = lo; level <= hi; level += 1) {
      const segments: LocationSegments = { zone, aisle, bay, level, position };
      out.push({
        segments,
        hand: bayHandName(spec.letter, level),
      });
    }
  }
  return out;
}

/** Dashed codes in scan order — used by tests and print toasts. */
export function expandBayLevelCodes(opts: {
  zone: string;
  aisle: number;
  position?: number;
  bays: readonly BayLevelRange[];
}): string[] {
  return expandBayLevelSegments(opts).map((row) => locationCode(row.segments));
}
