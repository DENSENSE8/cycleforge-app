/**
 * Pack bench presentation kinds — how a packing DESK/STAGING `locations` row
 * reads on a dense strip. Views assemble resolved facts; they never invent a
 * bench label map (Kinetic Ledger law 4).
 */

interface PackBenchLabelSource {
  locationName: string;
  locationKind: string;
}

/**
 * Bench chip tone — **bg + text only**, no ring.
 *
 * `GridStatusCellValue` supplies its own `ring-current/20`, so a ring here
 * would draw twice on the grid cell. The chip-row face adds its own ring
 * instead. One tone across the To-ship Station cell and the Ready-to-Pack
 * count chips, so a bench reads the same wherever it appears.
 */
export const PACK_BENCH_CHIP_TONE = 'bg-blue-50 text-blue-700';

/**
 * Short bench label for a dense chip / KPI tile — `Station 2`, `Staging`.
 *
 * A bench's stored name carries tenant and QA prefixes (`QA Packing Desk 2`)
 * that cost a chip its whole width and say nothing an operator standing at the
 * bench does not already know. The trailing number is the part they read.
 */
export function packBenchShortLabel(row: PackBenchLabelSource): string {
  if (row.locationKind === 'STAGING') return 'Staging';
  const trailingNumber = row.locationName.match(/(\d+)\s*$/);
  if (trailingNumber) return `Station ${trailingNumber[1]}`;
  return row.locationName.replace(/^QA\s+/i, '').trim() || row.locationName;
}
