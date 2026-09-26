/** Phase D — tracking ↔ receiving match reliability. */
import type { PoolClient } from 'pg';
import pool from '@/lib/db';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { transitionReceivingLine } from '@/lib/receiving/state-machine';

interface TrackingMatchReconcileResult {
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

  // ─── D4a. Candidates (read-only, raw pool) ──────────────────────────────── A still-EXPECTED incoming line should leave Incoming once its…
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
      // Linkage half:
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
        // expectedFrom:'EXPECTED' reproduces the old WHERE double-guard:
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
