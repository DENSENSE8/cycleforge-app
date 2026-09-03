/**
 * document_print_jobs ledger — JIT pack documents Phase 1–2.
 * One row per outbound PDF / product-manual print attempt; idempotent on client_event_id.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

export type DocumentPrintJobType = 'shipping_label' | 'packing_slip' | 'manual';

export type DocumentPrintJobStatus =
  | 'queued'
  | 'dispatched'
  | 'fallback_browser'
  | 'failed'
  | 'skipped';

export interface DocumentPrintJobInput {
  orderId: number;
  packerLogId?: number | null;
  documentId?: number | null;
  productManualId?: number | null;
  documentType: DocumentPrintJobType;
  status: DocumentPrintJobStatus;
  printerProfileId?: number | null;
  printnodeJobId?: number | null;
  isReprint?: boolean;
  reprintOfId?: number | null;
  actorStaffId?: number | null;
  clientEventId?: string | null;
  error?: string | null;
}

export interface DocumentPrintJobRow {
  id: number;
  order_id: number;
  packer_log_id: number | null;
  document_id: number | null;
  product_manual_id: number | null;
  document_type: string;
  status: string;
  printer_profile_id: number | null;
  printnode_job_id: number | null;
  is_reprint: boolean;
  reprint_of_id: number | null;
  actor_staff_id: number | null;
  client_event_id: string | null;
  error: string | null;
  created_at: string;
}

export async function recordDocumentPrintJob(
  input: DocumentPrintJobInput,
  orgId: OrgId,
): Promise<DocumentPrintJobRow | null> {
  const inserted = await tenantQuery<DocumentPrintJobRow>(
    orgId,
    `INSERT INTO document_print_jobs
       (organization_id, order_id, packer_log_id, document_id, product_manual_id,
        document_type, status, printer_profile_id, printnode_job_id, is_reprint,
        reprint_of_id, actor_staff_id, client_event_id, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, false), $11, $12, $13, $14)
     ON CONFLICT (organization_id, client_event_id) WHERE client_event_id IS NOT NULL
       DO NOTHING
     RETURNING *`,
    [
      orgId,
      input.orderId,
      input.packerLogId ?? null,
      input.documentId ?? null,
      input.productManualId ?? null,
      input.documentType,
      input.status,
      input.printerProfileId ?? null,
      input.printnodeJobId ?? null,
      input.isReprint ?? false,
      input.reprintOfId ?? null,
      input.actorStaffId ?? null,
      input.clientEventId ?? null,
      input.error ?? null,
    ],
  );
  if (inserted.rows[0]) return inserted.rows[0];

  if (input.clientEventId) {
    const existing = await tenantQuery<DocumentPrintJobRow>(
      orgId,
      `SELECT * FROM document_print_jobs
        WHERE organization_id = $1 AND client_event_id = $2 LIMIT 1`,
      [orgId, input.clientEventId],
    );
    return existing.rows[0] ?? null;
  }
  return null;
}

export async function getDocumentPrintJobByEventId(
  orgId: OrgId,
  clientEventId: string,
): Promise<DocumentPrintJobRow | null> {
  const res = await tenantQuery<DocumentPrintJobRow>(
    orgId,
    `SELECT * FROM document_print_jobs
      WHERE organization_id = $1 AND client_event_id = $2
      LIMIT 1`,
    [orgId, clientEventId],
  );
  return res.rows[0] ?? null;
}

export async function listDocumentPrintJobsForOrder(
  orderId: number,
  orgId: OrgId,
  limit = 20,
): Promise<DocumentPrintJobRow[]> {
  const res = await tenantQuery<DocumentPrintJobRow>(
    orgId,
    `SELECT * FROM document_print_jobs
      WHERE organization_id = $1 AND order_id = $2
      ORDER BY created_at DESC, id DESC
      LIMIT $3`,
    [orgId, orderId, Math.max(1, Math.min(100, limit))],
  );
  return res.rows;
}

/**
 * Packing Chrome loopback: after `fallback_browser` jobs print via local agent,
 * promote matching rows to `dispatched` (clears stale browser-fallback status).
 */
export async function markDocumentPrintJobsDispatched(
  orgId: OrgId,
  orderId: number,
  jobIds: number[],
): Promise<number[]> {
  const ids = [
    ...new Set(
      jobIds
        .map((n) => Math.floor(Number(n)))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  ];
  if (ids.length === 0) return [];
  const res = await tenantQuery<{ id: number }>(
    orgId,
    `UPDATE document_print_jobs
        SET status = 'dispatched', error = NULL
      WHERE organization_id = $1
        AND order_id = $2
        AND id = ANY($3::bigint[])
        AND status = 'fallback_browser'
      RETURNING id`,
    [orgId, orderId, ids],
  );
  return res.rows.map((r) => Number(r.id));
}
