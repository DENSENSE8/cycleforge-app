/**
 * Server bindings for {@link previewUnboxScan}.
 *
 * Split from the core so the resolution ladder unit-tests with zero network:
 * `tenantQuery` pulls in `@/lib/db`, which carries `server-only` and a Neon
 * driver. Same seam as `reply-persona-deps.ts` / `analyze-core.ts`.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import { resolveShipmentForScan } from '@/lib/receiving/resolve-shipment-for-scan';
import { resolveSupportTicketToReceiving } from '@/lib/support/tickets';
import type { OrgId } from '@/lib/tenancy/constants';
import type { PreviewScanDeps, PreviewSummaryRow } from './preview-scan';

/**
 * Carton summary for the preview face. Counts are subselects rather than a
 * GROUP BY join — a carton with zero lines must still resolve (that is exactly
 * the unmatched case an operator previews), and an inner join would drop it.
 */
async function loadSummary(orgId: string, receivingId: number): Promise<PreviewSummaryRow | null> {
  const res = await tenantQuery<PreviewSummaryRow>(
    orgId,
    `SELECT r.id,
            r.zoho_purchaseorder_number AS po_number,
            r.zendesk_ticket,
            r.source_platform,
            u.opened_at,
            (SELECT count(*) FROM receiving_line rl
              WHERE rl.receiving_id = r.id AND rl.organization_id = $1) AS line_count,
            (SELECT coalesce(sum(coalesce(rl.quantity_expected, rl.quantity_received, 0)), 0)
               FROM receiving_line rl
              WHERE rl.receiving_id = r.id AND rl.organization_id = $1) AS unit_count,
            (SELECT rl.item_name FROM receiving_line rl
              WHERE rl.receiving_id = r.id AND rl.organization_id = $1
              ORDER BY rl.id LIMIT 1) AS title,
            (SELECT rl.workflow_status FROM receiving_line rl
              WHERE rl.receiving_id = r.id AND rl.organization_id = $1
              ORDER BY rl.workflow_status LIMIT 1) AS status
       FROM receiving_carton r
       LEFT JOIN receiving_unbox u
         ON u.receiving_id = r.id AND u.organization_id = $1
      WHERE r.id = $2 AND r.organization_id = $1
      LIMIT 1`,
    [orgId, receivingId],
  );
  return res.rows[0] ?? null;
}

async function resolveTracking(value: string, orgId: string): Promise<number | null> {
  const resolved = await resolveShipmentForScan(value, orgId as OrgId);
  return resolved.receivingId ?? null;
}

async function resolveTicket(orgId: string, value: string): Promise<number | null> {
  const ref = await resolveSupportTicketToReceiving(orgId, value);
  return ref?.receivingId ?? null;
}

/** PO # → carton. Exact first, then the vendor-number half of a `PO-1234-1` face. */
async function resolvePo(orgId: string, value: string): Promise<number | null> {
  const res = await tenantQuery<{ id: string }>(
    orgId,
    `SELECT id FROM receiving_carton
      WHERE organization_id = $1
        AND upper(zoho_purchaseorder_number) = upper($2)
      ORDER BY id DESC
      LIMIT 1`,
    [orgId, value],
  );
  return res.rows[0] ? Number(res.rows[0].id) : null;
}

export const defaultPreviewScanDeps: PreviewScanDeps = {
  loadSummary,
  resolveTracking,
  resolveTicket,
  resolvePo,
};

