/**
 * Phase D — tracking ↔ receiving match reliability.
 *
 * Historically this job also back-linked receiving rows that carried a carrier
 * tracking number in the legacy `receiving.receiving_tracking_number` text column
 * but had no `shipment_id` (D2 exact/suffix link + D3 residual register/except).
 * That column has been DROPPED: every intake path now registers its tracking into
 * `shipping_tracking_numbers` and sets `receiving.shipment_id` at scan time
 * (`record-scan` → `linkScanToStn`, the unmatched/door inserts, the manual-edit
 * routes), and a one-time backfill linked all historical rows. With no text column
 * left to reconcile, D2/D3 are retired.
 *
 * What remains is D4 — the only stage that never touched the dropped column:
 *   D4  advance still-EXPECTED PO lines whose shipment tracking's LAST 8 matches
 *       a dock scan → MATCHED + attach to the scanned carton, so a scanned box
 *       actually leaves Incoming in the data (not just hidden by the read-side
 *       SHIPMENT_SCANNED_PREDICATE). Keyed on last-8 because the Zoho-pasted
 *       number and the scanned barcode are different representations of the same
 *       package; this is the write-path twin of that predicate.
 *
 * Chokepoint fold (§7 Step D): the former single set-based CTE UPDATE on the raw
 * pool wrote `workflow_status` directly with ZERO org scoping (cross-tenant cron).
 * Now: a read-only candidates SELECT (raw pool, carries organization_id and
 * org-scopes the carton/scan joins so a line can never match another tenant's
 * dock scan), then per org one withTenantTransaction that (a) does the raw
 * receiving_id-linkage UPDATE — deliberately NOT listing workflow_status, so the
 * coarse trigger can't spuriously stamp scanned_at on rows that end up skipped —
 * and (b) routes each status advance through transitionReceivingLine() with
 * expectedFrom:'EXPECTED' (409 = the line left EXPECTED since the SELECT → skip,
 * reproducing the old `WHERE workflow_status = 'EXPECTED'` double-guard).
 * skipEvent: this reconcile is a system-side data repair; the dock scan that
 * justified it already lives in receiving_scans.
 *
 * Deps-injected (default real impls) so unit tests run DB-free.
 */
import type { PoolClient } from 'pg';
import pool from '@/lib/db';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { transitionReceivingLine } from '@/lib/receiving/state-machine';

export interface TrackingMatchReconcileResult {
  ok: boolean;
  /** rows linked to an existing STN by exact normalized match. Retired → 0. */
  linkedExact: number;
  /** rows linked to an existing STN by 18-char suffix match. Retired → 0. */
  linkedSuffix: number;
  /** carrier-detectable rows for which a new STN was registered. Retired → 0. */
  registered: number;
  /** tracking-shaped rows we couldn't place → tracking_exceptions. Retired → 0. */
  exceptions: number;
  /** still-EXPECTED PO lines advanced to MATCHED by a last-8 scan match (D4). */
  advancedLines: number;
  durationMs: number;
}

interface CandidateRow {
  rl_id: number;
  organization_id: string;
  scan_carton: number | null;
}

export interface TrackingMatchReconcileDeps {
  /** Read-only candidates query on the raw (cross-tenant) pool. */
  query: (sql: string, params?: unknown[]) => Promise<{ rows: CandidateRow[] }>;
  withTenantTx: <T>(orgId: OrgId, fn: (client: PoolClient) => Promise<T>) => Promise<T>;
  transitionLine: typeof transitionReceivingLine;
}

const defaultDeps: TrackingMatchReconcileDeps = {
  query: (sql, params) => pool.query(sql, params as unknown[] | undefined),
  withTenantTx: withTenantTransaction,
  transitionLine: transitionReceivingLine,
};

export async function runTrackingMatchReconcileJob(
  deps: TrackingMatchReconcileDeps = defaultDeps,
): Promise<TrackingMatchReconcileResult> {
  const start = Date.now();

  // ─── D4a. Candidates (read-only, raw pool) ────────────────────────────────
  // A still-EXPECTED incoming line should leave Incoming once its box is scanned
  // at the dock. The PO-id linker (lookup-po's linkLocalPoLinesToReceiving) only
  // fires when the scan resolves to the PO at scan time, so lines scanned via the
  // unmatched path — or synced after the scan — stay EXPECTED forever. Bridge them
  // by tracking number: resolve each incoming line to its shipment (the carton it
  // soft-joins to, FK or PO# fallback), and if any dock scan's digits contain that
  // shipment tracking's LAST 8, the line is a candidate to advance to MATCHED and
  // attach to the scanned carton. Last-8 because the Zoho-pasted value and the
  // scanned barcode are different representations — the same key the read-side
  // predicate uses, so the display guard and this write agree. Carton + scan
  // joins are org-scoped so a line never matches another tenant's dock scan.
  const candidates = await deps.query(
    `WITH inc AS (
       SELECT rl.id AS rl_id, rl.receiving_id, rz.zoho_purchaseorder_id,
              rl.organization_id
         FROM receiving_line rl
         LEFT JOIN receiving_line_zoho rz
           ON rz.receiving_line_id = rl.id
          AND rz.organization_id = rl.organization_id
        WHERE rl.workflow_status = 'EXPECTED'
          AND COALESCE(rl.quantity_received, 0) = 0
          AND rz.zoho_purchaseorder_id IS NOT NULL
     ),
     resolved AS (
       SELECT inc.rl_id, inc.receiving_id, inc.organization_id,
              stn.tracking_number_normalized AS norm
         FROM inc
         JOIN LATERAL (
           SELECT r.shipment_id FROM receiving_carton r
            WHERE r.organization_id = inc.organization_id
              AND (r.id = inc.receiving_id
                   OR (inc.receiving_id IS NULL
                       AND r.source = 'zoho_po'
                       AND r.zoho_purchaseorder_id = inc.zoho_purchaseorder_id))
            ORDER BY (r.id = inc.receiving_id) DESC,
                     (r.shipment_id IS NOT NULL) DESC,
                     r.id DESC
            LIMIT 1
         ) r ON TRUE
         JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
        WHERE length(stn.tracking_number_normalized) >= 8
     ),
     matched AS (
       SELECT DISTINCT ON (resolved.rl_id)
              resolved.rl_id,
              resolved.organization_id,
              rs.receiving_id AS scan_carton
         FROM resolved
         JOIN receiving_scans rs
           ON rs.organization_id = resolved.organization_id
          AND position(
                right(resolved.norm, 8)
                IN regexp_replace(upper(rs.tracking_number), '[^A-Z0-9]', '', 'g')
              ) > 0
        ORDER BY resolved.rl_id, rs.scanned_at DESC NULLS LAST
     )
     SELECT rl_id, organization_id, scan_carton FROM matched`,
  );

  // ─── D4b. Group by org; per org, link + transition in one tenant tx ───────
  const byOrg = new Map<string, Array<{ rlId: number; scanCarton: number | null }>>();
  for (const row of candidates.rows) {
    const orgId = String(row.organization_id ?? '').trim();
    const rlId = Number(row.rl_id);
    if (!orgId || !Number.isFinite(rlId)) continue;
    if (!byOrg.has(orgId)) byOrg.set(orgId, []);
    byOrg.get(orgId)!.push({ rlId, scanCarton: row.scan_carton ?? null });
  }

  let advancedLines = 0;
  for (const [orgId, rows] of byOrg) {
    advancedLines += await deps.withTenantTx(orgId as OrgId, async (client) => {
      // Linkage half: receiving_id only — deliberately does NOT list
      // workflow_status (the coarse trigger fires on any SET of that column and
      // would COALESCE-stamp scanned_at even on rows the guard below skips).
      // The still-EXPECTED WHERE mirrors the old atomic UPDATE's guard so a
      // line that advanced meanwhile is neither re-linked nor re-transitioned.
      await client.query(
        `UPDATE receiving_line rl
            SET receiving_id = COALESCE(rl.receiving_id, v.scan_carton),
                updated_at = now()
           FROM unnest($1::int[], $2::int[]) AS v(rl_id, scan_carton)
          WHERE rl.id = v.rl_id
            AND rl.workflow_status = 'EXPECTED'`,
        [rows.map((r) => r.rlId), rows.map((r) => r.scanCarton)],
      );
      let advanced = 0;
      for (const r of rows) {
        // expectedFrom:'EXPECTED' reproduces the old WHERE double-guard: a 409
        // (line left EXPECTED since the candidates SELECT) is a per-row skip,
        // never a tx failure. The linkage UPDATE above already row-locked the
        // still-EXPECTED rows, so the chokepoint's FOR UPDATE re-lock is a no-op.
        const tr = await deps.transitionLine(
          {
            receivingLineId: r.rlId,
            to: 'MATCHED',
            expectedFrom: 'EXPECTED',
            skipEvent: true,
            station: 'SYSTEM',
          },
          client,
          orgId as OrgId,
        );
        if (tr.ok) advanced += 1;
      }
      return advanced;
    });
  }

  return {
    ok: true,
    linkedExact: 0,
    linkedSuffix: 0,
    registered: 0,
    exceptions: 0,
    advancedLines,
    durationMs: Date.now() - start,
  };
}
