/**
 * Expand a Labels / Racks print run: freeze the breadcrumb, vary ONE axis
 * from–through. Never Cartesian-product racks × levels × positions.
 */

import {
  locationCode,
  rackCode,
  rackToLocation,
  type LocationSegments,
  type RackSegments,
} from '@/lib/barcode-routing';
import {
  PARTS_DRAWER_BAY_LEVELS,
  expandBayLevelSegments,
  type BayLevelRange,
} from '@/lib/locations/expand-bay-levels';

export type PrintRunVaryAxis = 'bay' | 'level' | 'position';

const MAX_SEGMENT = 99;

function clampSegment(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  const v = Math.floor(n);
  if (v < 1 || v > MAX_SEGMENT) return null;
  return v;
}

function zoneLetter(z: string): string | null {
  const c = String(z ?? '')
    .trim()
    .toUpperCase()
    .charAt(0);
  return /^[A-Z]$/.test(c) ? c : null;
}

type ExpandPrintRunInput = {
  zone: string;
  aisle: number;
  /** Required when varying level or position. */
  bay?: number;
  /** Required when varying position; default 1 when varying bay/level. */
  level?: number;
  /** Default 1 when varying bay/level for qty bins. Ignored for racks (position 0). */
  position?: number;
  vary: PrintRunVaryAxis;
  from: number;
  through: number;
  /**
   * When true, emit rack codes (`position: 0`). Valid with `vary: 'level'` or
   * `vary: 'bay'` (fixed level). Position axis stays qty-bin only.
   */
  rack?: boolean;
};

export type ExpandedPrintRunRow = {
  segments: LocationSegments;
  code: string;
};

/**
 * One face per value on the varied axis. Invalid ranges return [].
 */
export function expandPrintRun(input: ExpandPrintRunInput): ExpandedPrintRunRow[] {
  const zone = zoneLetter(input.zone);
  const aisle = clampSegment(input.aisle);
  if (!zone || !aisle) return [];

  const from = clampSegment(input.from);
  const through = clampSegment(input.through);
  if (!from || !through) return [];
  const lo = Math.min(from, through);
  const hi = Math.max(from, through);

  if (input.rack) {
    if (input.vary === 'level') {
      const bay = clampSegment(input.bay ?? NaN);
      if (!bay) return [];
      const out: ExpandedPrintRunRow[] = [];
      for (let level = lo; level <= hi; level += 1) {
        const rack: RackSegments = { zone, aisle, bay, level };
        const segments = rackToLocation(rack);
        out.push({ segments, code: rackCode(rack) });
      }
      return out;
    }
    if (input.vary === 'bay') {
      const level = clampSegment(input.level ?? 1);
      if (!level) return [];
      const out: ExpandedPrintRunRow[] = [];
      for (let bay = lo; bay <= hi; bay += 1) {
        const rack: RackSegments = { zone, aisle, bay, level };
        out.push({ segments: rackToLocation(rack), code: rackCode(rack) });
      }
      return out;
    }
    return [];
  }

  if (input.vary === 'bay') {
    const level = clampSegment(input.level ?? 1);
    const position = clampSegment(input.position ?? 1);
    if (!level || !position) return [];
    const out: ExpandedPrintRunRow[] = [];
    for (let bay = lo; bay <= hi; bay += 1) {
      const segments: LocationSegments = { zone, aisle, bay, level, position };
      out.push({ segments, code: locationCode(segments) });
    }
    return out;
  }

  if (input.vary === 'level') {
    const bay = clampSegment(input.bay ?? NaN);
    const position = clampSegment(input.position ?? 1);
    if (!bay || !position) return [];
    const out: ExpandedPrintRunRow[] = [];
    for (let level = lo; level <= hi; level += 1) {
      const segments: LocationSegments = { zone, aisle, bay, level, position };
      out.push({ segments, code: locationCode(segments) });
    }
    return out;
  }

  // vary === 'position'
  const bay = clampSegment(input.bay ?? NaN);
  const level = clampSegment(input.level ?? NaN);
  if (!bay || !level) return [];
  const out: ExpandedPrintRunRow[] = [];
  for (let position = lo; position <= hi; position += 1) {
    const segments: LocationSegments = { zone, aisle, bay, level, position };
    out.push({ segments, code: locationCode(segments) });
  }
  return out;
}

/** Parts drawers preset — same identities as expandBayLevelSegments(PARTS_DRAWER…). */
export function expandPartsDrawersPrintRun(opts: {
  zone: string;
  aisle: number;
  bays?: readonly BayLevelRange[];
}): ExpandedPrintRunRow[] {
  return expandBayLevelSegments({
    zone: opts.zone,
    aisle: opts.aisle,
    bays: opts.bays ?? PARTS_DRAWER_BAY_LEVELS,
  }).map((row) => ({
    segments: row.segments,
    code: locationCode(row.segments),
  }));
}

type ExpandOddEvenBayLevelsInput = {
  zone: string;
  aisle: number;
  bayFrom: number;
  bayThrough: number;
  /** Levels 1…N on odd-numbered bays (1, 3, 5…). */
  oddLevels: number;
  /** Levels 1…M on even-numbered bays (2, 4, 6…). */
  evenLevels: number;
  /** Qty-bin position; ignored when `rack`. Default 1. */
  position?: number;
  /** Emit rack codes (`position: 0`). */
  rack?: boolean;
};

/**
 * Bay range × levels-per-bay by parity — e.g. odd bays 10 levels, even bays 6.
 * One face per (bay, level). Not a full Cartesian of racks × levels × positions.
 */
export function expandOddEvenBayLevelsPrintRun(
  input: ExpandOddEvenBayLevelsInput,
): ExpandedPrintRunRow[] {
  const zone = zoneLetter(input.zone);
  const aisle = clampSegment(input.aisle);
  const bayFrom = clampSegment(input.bayFrom);
  const bayThrough = clampSegment(input.bayThrough);
  const oddLevels = clampSegment(input.oddLevels);
  const evenLevels = clampSegment(input.evenLevels);
  if (!zone || !aisle || !bayFrom || !bayThrough || !oddLevels || !evenLevels) {
    return [];
  }

  const lo = Math.min(bayFrom, bayThrough);
  const hi = Math.max(bayFrom, bayThrough);

  if (input.rack) {
    const out: ExpandedPrintRunRow[] = [];
    for (let bay = lo; bay <= hi; bay += 1) {
      const levelEnd = bay % 2 === 1 ? oddLevels : evenLevels;
      for (let level = 1; level <= levelEnd; level += 1) {
        const rack: RackSegments = { zone, aisle, bay, level };
        out.push({ segments: rackToLocation(rack), code: rackCode(rack) });
      }
    }
    return out;
  }

  const position = clampSegment(input.position ?? 1);
  if (!position) return [];

  const bays: BayLevelRange[] = [];
  for (let bay = lo; bay <= hi; bay += 1) {
    const levelEnd = bay % 2 === 1 ? oddLevels : evenLevels;
    bays.push({
      bay,
      letter: String.fromCharCode(64 + Math.min(bay, 26)),
      levelStart: 1,
      levelEnd,
    });
  }

  return expandBayLevelSegments({
    zone,
    aisle,
    position,
    bays,
  }).map((row) => ({
    segments: row.segments,
    code: locationCode(row.segments),
  }));
}

type ExpandRaggedBayLevelsInput = {
  zone: string;
  aisle: number;
  bays: readonly BayLevelRange[];
  /** Qty-bin position; ignored when `rack`. Default 1. */
  position?: number;
  /** Emit rack codes (`position: 0`). Labels / qty bins pass false. */
  rack?: boolean;
};

/**
 * Selected bays × that bay’s level range (ragged 2-axis).
 * Walk order: bay ascending, then level ascending. Not a 3-axis cube.
 */
export function expandRaggedBayLevelsPrintRun(
  input: ExpandRaggedBayLevelsInput,
): ExpandedPrintRunRow[] {
  const zone = zoneLetter(input.zone);
  const aisle = clampSegment(input.aisle);
  if (!zone || !aisle || input.bays.length === 0) return [];

  const specs = [...input.bays]
    .map((spec) => {
      const bay = clampSegment(spec.bay);
      const start = clampSegment(spec.levelStart);
      const end = clampSegment(spec.levelEnd);
      if (!bay || !start || !end) return null;
      return { bay, lo: Math.min(start, end), hi: Math.max(start, end) };
    })
    .filter((row): row is { bay: number; lo: number; hi: number } => row != null)
    .sort((a, b) => a.bay - b.bay);

  if (specs.length === 0) return [];

  if (input.rack) {
    const out: ExpandedPrintRunRow[] = [];
    for (const spec of specs) {
      for (let level = spec.lo; level <= spec.hi; level += 1) {
        const rack: RackSegments = { zone, aisle, bay: spec.bay, level };
        out.push({ segments: rackToLocation(rack), code: rackCode(rack) });
      }
    }
    return out;
  }

  const position = clampSegment(input.position ?? 1);
  if (!position) return [];
  return expandBayLevelSegments({
    zone,
    aisle,
    position,
    bays: specs.map((spec) => ({
      bay: spec.bay,
      letter: String.fromCharCode(64 + Math.min(spec.bay, 26)),
      levelStart: spec.lo,
      levelEnd: spec.hi,
    })),
  }).map((row) => ({
    segments: row.segments,
    code: locationCode(row.segments),
  }));
}

/** Seed Vary from the deepest completed Labels step. */
export function seedPrintRunVary(freeze: {
  aisle?: number | null;
  bay?: number | null;
  level?: number | null;
  rack?: boolean;
}): PrintRunVaryAxis {
  if (freeze.rack) return 'level';
  if (freeze.level != null) return 'position';
  if (freeze.bay != null) return 'level';
  return 'bay';
}
