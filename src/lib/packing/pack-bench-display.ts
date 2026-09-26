/**
 * Pack bench presentation kinds — how a packing DESK/STAGING `locations` row
 * reads on a dense strip. Views assemble resolved facts; they never invent a
 * bench label map (Kinetic Ledger law 4).
 */

interface PackBenchLabelSource {
  /**
   * The bench's name AS THE READ RESOLVED IT. Count rows already arrive
   * display-resolved from SQL ({@link locationDisplayNameSql}); a caller holding
   * the raw `locations` row passes {@link locationDisplayName} beside it.
   */
  locationName: string;
  /** Operator nickname when the caller has the unresolved row. */
  locationDisplayName?: string | null;
  locationKind: string;
}

/** Bench chip tone — **bg + text only**, no ring. */
const PACK_BENCH_CHIP_TONE = 'bg-blue-50 text-blue-700';

/**
 * Short bench label for a dense chip / KPI tile.
 * **The operator's display name IS the label** (ruled 2026-08-10) — the
 */
export function packBenchShortLabel(row: PackBenchLabelSource): string {
  const nickname = row.locationDisplayName?.replace(/^QA\s+/i, '').trim();
  if (nickname) return nickname;
  const name = row.locationName.replace(/^QA\s+/i, '').trim();
  if (name) return name;
  return row.locationKind === 'STAGING' ? 'Staging' : 'Bench';
}
