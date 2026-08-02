/**
 * Zoho-received reconciliation — closes the loop the PO-mirror sync opens.
 *
 * The mirror sync refreshes `zoho_po_mirror.status`, but until now nothing
 * propagated a terminal "received" status back onto the local
 * `receiving_line`, so a PO received directly in Zoho sat forever in the
 * triage SCANNED/Prioritize queue at 0/N. This helper marks those lines
 * received locally — the same field writes /api/receiving/mark-received does
 * (qty up to expected, workflow → DONE) — so they drop off the queue on the
 * next read.
 *
 * Scope is exactly the scanned-queue state (door-scanned carton, not unboxed,
 * nothing received yet): EXPECTED-only rows that were never scanned stay
 * untouched — the Incoming view already hides Zoho-terminal POs via
 * NOT_ZOHO_RECEIVED_PREDICATE. Only received-like statuses qualify;
 * cancelled/rejected POs must not be recorded as received.
 *
 * Runs inside syncZohoPoMirror (cron + Sync Zoho button + per-PO sync), so
 * every mirror refresh takes care of this automatically.
 */

import pool from '@/lib/db';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { transitionReceivingLine } from '@/lib/receiving/state-machine';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { ZOHO_RECEIVED_LIKE_STATUSES } from '@/lib/receiving/zoho-received-status';

/**
 * Re-exported so this module stays the import path server callers already use,
 * while the pure list lives in a leaf module client bundles can also reach.
 */
export { ZOHO_RECEIVED_LIKE_STATUSES };

export interface ZohoReceivedReconcileResult {
  /** receiving_line rows marked received. */
  updated: number;
}

export async function reconcileZohoReceivedLines(
  orgId: OrgId,
  opts: { zohoPurchaseOrderId?: string } = {},
): Promise<ZohoReceivedReconcileResult> {
  const scopedPoId = (opts.zohoPurchaseOrderId || '').trim() || null;

  const statusesSql = ZOHO_RECEIVED_LIKE_STATUSES.map((s) => `'${s}'`).join(',');

  type ReconciledRow = {
    id: number;
    before_workflow: string | null;
    before_qty: number | null;
    after_qty: number;
    quantity_expected: number | null;
    zoho_status: string | null;
    zoho_purchaseorder_id: string | null;
  };

  // org-scoped: only this tenant's mirror rows drive its own receiving_line,
  // and every write runs under the tenant GUC (FORCE-ready) inside ONE
  // transaction.
  //
  // Step D fold (receiving state-machine chokepoint): was a single set-based
  // CTE UPDATE that set quantity_received + workflow_status='DONE' together.
  // Now: locked candidates SELECT (same predicates) → raw
  // quantity_received-only UPDATE (does NOT list workflow_status, so the
  // coarse trigger fires only on the real transition) → per-row
  // transitionReceivingLine to DONE. skipEvent: this reconciler never emitted
  // inventory_events; the per-row recordAudit below stays the observability.
  // Candidates with workflow_status IS NULL hit the chokepoint's permissive
  // unmodeled-edge guard (warn + proceed) — acceptable: legacy NULL-status
  // rows were always force-completed here, and the warn surfaces them.
  const rows = await withTenantTransaction<ReconciledRow[]>(orgId, async (client) => {
    const candidates = await client.query<{
      id: number;
      before_workflow: string | null;
      before_qty: number | null;
      zoho_status: string | null;
      zoho_purchaseorder_id: string | null;
    }>(
      `SELECT rl.id,
              rl.workflow_status::text AS before_workflow,
              rl.quantity_received     AS before_qty,
              mirror.status            AS zoho_status,
              rz.zoho_purchaseorder_id
         FROM receiving_line rl
         -- Wave-2 reader cutover: the line's zoho cluster reads from
         -- receiving_line_zoho (1:1, PK receiving_line_id; a row exists for
         -- every line with ANY zoho field, so the inner mirror join below is
         -- equivalent to the old spine-column join).
         LEFT JOIN receiving_line_zoho rz
           ON rz.receiving_line_id = rl.id
          AND rz.organization_id = rl.organization_id
         JOIN zoho_po_mirror mirror
           ON mirror.zoho_purchaseorder_id = rz.zoho_purchaseorder_id
          AND mirror.organization_id = $2
        -- No COALESCE on status: NULL can't match, and the bare column keeps
        -- idx_zoho_po_mirror_status (partial, status IS NOT NULL) usable.
        WHERE mirror.status IN (${statusesSql})
          AND rl.organization_id = $2
          AND COALESCE(rl.quantity_received, 0) = 0
          AND (rl.workflow_status IS NULL
               OR rl.workflow_status IN ('EXPECTED','ARRIVED','MATCHED'))
          -- Door-scanned (receiving_triage.door_received_at), not unboxed
          -- (receiving_unbox.unboxed_at; both street tables 1:1 with the
          -- carton, no row ≡ NULL spine value) — via the SAME soft join the
          -- receiving-lines list uses: direct FK, else the PO's canonical
          -- zoho_po carton when the line was never adopted (receiving_id
          -- NULL). Without the fallback arm, late-synced orphan lines render
          -- in the scanned rail (the list's fallback finds the carton) but
          -- never reconcile out of it.
          AND EXISTS (
            SELECT 1 FROM receiving_carton r
             LEFT JOIN receiving_triage rt
               ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
             LEFT JOIN receiving_unbox ru
               ON ru.receiving_id = r.id AND ru.organization_id = r.organization_id
             WHERE rt.door_received_at IS NOT NULL
               AND ru.unboxed_at IS NULL
               AND r.organization_id = $2
               AND (r.id = rl.receiving_id
                    OR (rl.receiving_id IS NULL
                        AND r.source = 'zoho_po'
                        AND r.zoho_purchaseorder_id = rz.zoho_purchaseorder_id))
          )
          AND ($1::text IS NULL OR rz.zoho_purchaseorder_id = $1)
        ORDER BY rl.id
        FOR UPDATE OF rl`,
      [scopedPoId, orgId],
    );
    if (candidates.rows.length === 0) return [];

    // Facts half: quantity only — workflow_status is deliberately NOT in this
    // SET list (the coarse trigger fires on any SET of it, even unchanged).
    const updated = await client.query<{
      id: number;
      after_qty: number;
      quantity_expected: number | null;
    }>(
      `UPDATE receiving_line
          SET quantity_received = GREATEST(
                COALESCE(quantity_received, 0),
                COALESCE(quantity_expected, 1)
              ),
              updated_at = NOW()
        WHERE id = ANY($1::int[])
        RETURNING id, quantity_received AS after_qty, quantity_expected`,
      [candidates.rows.map((c) => c.id)],
    );
    const afterById = new Map(updated.rows.map((r) => [r.id, r]));

    // Lifecycle half: every candidate is in a non-DONE state by the WHERE
    // clause, so all of them transition (no identity no-ops to skip).
    for (const c of candidates.rows) {
      await transitionReceivingLine(
        { receivingLineId: c.id, to: 'DONE', station: 'SYSTEM', skipEvent: true },
        client,
        orgId,
      );
    }

    return candidates.rows.map((c) => ({
      id: c.id,
      before_workflow: c.before_workflow,
      before_qty: c.before_qty,
      after_qty: Number(afterById.get(c.id)?.after_qty ?? 0),
      quantity_expected: afterById.get(c.id)?.quantity_expected ?? null,
      zoho_status: c.zoho_status,
      zoho_purchaseorder_id: c.zoho_purchaseorder_id,
    }));
  });

  if (rows.length === 0) return { updated: 0 };

  // Audit each reconciled line (system actor — no operator drove this).
  // Cron/domain caller with no request: ctx/req are null and the tenant is
  // stamped via organizationIdOverride. recordAudit never throws, so a failed
  // audit insert can't fail the sync.
  await Promise.all(
    rows.map((row) =>
      recordAudit(pool, null, null, {
        source: 'zoho-po-sync',
        action: AUDIT_ACTION.PO_RECEIVE,
        entityType: AUDIT_ENTITY.RECEIVING_LINE,
        entityId: row.id,
        method: 'system',
        organizationIdOverride: orgId,
        before: {
          quantity_received: row.before_qty,
          workflow_status: row.before_workflow,
        },
        after: {
          quantity_received: row.after_qty,
          quantity_expected: row.quantity_expected,
          workflow_status: 'DONE',
        },
        extra: {
          reconciled_from_zoho: true,
          zoho_status: row.zoho_status,
          zoho_purchaseorder_id: row.zoho_purchaseorder_id,
        },
      }),
    ),
  );

  try {
    await invalidateReceivingViews(orgId);
  } catch (err) {
    console.warn('zoho-received-reconcile: cache invalidate failed (non-fatal)', err);
  }

  return { updated: rows.length };
}
