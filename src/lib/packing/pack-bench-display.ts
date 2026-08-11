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
 * Short bench label for a dense chip / KPI tile.
 *
 * **The operator's display name IS the label** (ruled 2026-08-10) — the
 * `locations.display_name` nickname when one is set, else the canonical
 * `locations.name`. One face everywhere the bench appears: the To-ship Station
 * cell, the Ready-to-Pack count chips, the bench facet, and Settings →
 * Stations, which is where the nickname is typed.
 *
 * **What this replaced, and why it had to go.** The label used to be DERIVED —
 * `Staging` for any STAGING row, `Station <trailing digits>` otherwise. That
 * made renaming impossible to trust: rename `Pack Desk 1` → `Bench 1` and the
 * chip still read `Station 1`; rename the staging row at all and the chip
 * ignored it outright. A derived face over an editable name is chrome inventing
 * a second story (Kinetic Ledger law 1), and it is exactly what the operator hit.
 *
 * The `QA ` strip survives because it is a FIXTURE concern, not a product one —
 * the QA org seeds `QA Packing Desk 1`, and no tenant ever types that prefix.
 * The kind-based fallbacks below only fire for a row whose name is empty, which
 * the DB does not allow today; they exist so an empty face is never a blank chip.
 */
export function packBenchShortLabel(row: PackBenchLabelSource): string {
  const nickname = row.locationDisplayName?.replace(/^QA\s+/i, '').trim();
  if (nickname) return nickname;
  const name = row.locationName.replace(/^QA\s+/i, '').trim();
  if (name) return name;
  return row.locationKind === 'STAGING' ? 'Staging' : 'Bench';
}
