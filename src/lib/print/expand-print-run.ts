/**
 * Mobile ragged expand — thin adapter over the Labels SoT.
 *
 * Callers: mobile /m/print. Canonical expand lives in
 * {@link expandRaggedBayLevelsPrintRun} from `@/lib/locations/expand-print-run`.
 */

import type { LocationSegments } from '@/lib/barcode-routing';
import { expandRaggedBayLevelsPrintRun as expandLocationRaggedRun } from '@/lib/locations/expand-print-run';

export const BAY_CHIP_COUNT = 16;

export type BayParity = 'all' | 'odds' | 'evens';

export type ExpandPrintRunInput = {
  zone: string;
  aisle: number;
  selectedBays: readonly number[];
  /** Bay number → inclusive max level (1-based). Missing bay uses 1. */
  bayLevels: Readonly<Record<number, number>>;
  grain: 'rack' | 'bin';
};

export function baysMatchingParity(bays: readonly number[], parity: BayParity): number[] {
  if (parity === 'odds') return bays.filter((b) => b % 2 === 1);
  if (parity === 'evens') return bays.filter((b) => b % 2 === 0);
  return [...bays];
}

export function expandRaggedBayLevelsPrintRun(input: ExpandPrintRunInput): LocationSegments[] {
  const bays = [...input.selectedBays]
    .map((b) => Number(b))
    .filter((b) => Number.isFinite(b) && b >= 1);
  if (bays.length === 0) return [];
  return expandLocationRaggedRun({
    zone: input.zone,
    aisle: input.aisle,
    rack: input.grain === 'rack',
    position: input.grain === 'bin' ? 1 : undefined,
    bays: bays.map((bay) => ({
      bay,
      letter: 'X',
      levelStart: 1,
      levelEnd: Math.max(1, Math.floor(Number(input.bayLevels[bay] ?? 1))),
    })),
  }).map((row) => row.segments);
}
