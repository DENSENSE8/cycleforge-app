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
