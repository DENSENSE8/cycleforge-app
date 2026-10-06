/**
 * Is a dock scan-out's timestamp BACKDATED — a time someone chose after the
 * fact — rather than the hand-off moment itself? The one rule behind the
 * "Backfill" marker (operator 2026-10-05): the Fulfilled sheet's Scan source
 * (`src/lib/nav/fulfilled/sql.ts`) and the shipment record's `shipOut.backfilled`
 * (`src/lib/shipments/shipment-record.ts`). SQL twin: {@link sqlScanOutBackdated}.
 *
 * `station_activity_logs` keeps no separate write time, but `updated_at` is
 * stamped at the write and never moved after (measured 2026-10-05: on every
 * audited SHIP_CONFIRM — 1,421 `bulk-scan-out`, 118 `shipped-scan-out` —
 * `updated_at` equals the audit row's write instant), while `created_at`
 * carries the backdate any origin may pass (`ScanOutInput.createdAt`). So:
 *
 * 1. `unmatched-scan-out-replay` — the held dock scan replayed later carries
 *    the original scan instant (`held.scannedAt`): the hand-off itself → not
 *    backdated, however late it was written;
 * 2. a scripted catch-up (`metadata.source` names a backfill / catch-up /
 *    staging run: `ops-backfill-scan-out`, `bulk-backfill-scan-out`,
 *    `bulk-catchup-scan-out`, `backfill-ship-confirm*`, `staging-backfill`,
 *    `dock-scan-out-backfill`) → backdated, even when the script stamped both
 *    columns alike;
 * 3. otherwise (`shipped-scan-out`, `bulk-scan-out`, no source) → backdated
 *    when it was written more than {@link SCAN_OUT_BACKDATE_TOLERANCE_SECONDS}
 *    away from the instant it claims.
 */

/** `metadata.source` of a held unmatched scan replayed onto its resolved package (`scan-out.ts`). */
export const SCAN_OUT_REPLAY_SOURCE = 'unmatched-scan-out-replay';

/** A live write lands within this of the instant it stamps (the request's own clock skew); past it, the stamp was chosen. */
export const SCAN_OUT_BACKDATE_TOLERANCE_SECONDS = 120;

/** Sources that name a scripted catch-up run. Spelled for both JS (`i` flag) and Postgres `~*`. */
const SCRIPTED_SOURCE_PATTERN = 'backfill|catch-?up|staging';
const SCRIPTED_SOURCE = new RegExp(SCRIPTED_SOURCE_PATTERN, 'i');

type Instant = string | Date;

export function scanOutBackdated(stamp: { source: string | null | undefined; createdAt: Instant; updatedAt: Instant | null | undefined }): boolean {
  const source = String(stamp.source ?? '').trim();
  if (source === SCAN_OUT_REPLAY_SOURCE) return false;
  if (SCRIPTED_SOURCE.test(source)) return true;
  if (stamp.updatedAt == null || stamp.updatedAt === '') return false;
  const gap = new Date(stamp.updatedAt).getTime() - new Date(stamp.createdAt).getTime();
  return Number.isFinite(gap) && Math.abs(gap) > SCAN_OUT_BACKDATE_TOLERANCE_SECONDS * 1000;
}

/** {@link scanOutBackdated} over a `station_activity_logs` row aliased `alias` (a SQL boolean). */
export function sqlScanOutBackdated(alias: string): string {
  const source = `COALESCE(BTRIM(${alias}.metadata->>'source'), '')`;
  return `(CASE
      WHEN ${source} = '${SCAN_OUT_REPLAY_SOURCE}' THEN false
      WHEN ${source} ~* '${SCRIPTED_SOURCE_PATTERN}' THEN true
      WHEN ${alias}.updated_at IS NULL THEN false
      ELSE abs(extract(epoch FROM ${alias}.updated_at - ${alias}.created_at)) > ${SCAN_OUT_BACKDATE_TOLERANCE_SECONDS}
    END)`;
}
