import 'server-only';

import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { listSweepOrgIds } from '@/lib/cron/for-each-org';
import { fetchOutboundDocuments } from '@/lib/documents/outbound-documents';
import type {
  PackingSlipIngestState,
  PackingSlipIngestStatus,
} from '@/lib/documents/types';

interface JobRow {
  id: number | string;
  order_id: number | string;
  status: 'pending' | 'processing' | 'available' | 'failed';
  attempt_count: number | string;
  next_attempt_at: string | null;
  document_id: number | string | null;
  last_error: string | null;
}

export function projectEcwidPackingSlipJob(row: JobRow): PackingSlipIngestState {
  const status: PackingSlipIngestStatus =
    row.status === 'available' ? 'available' : row.status === 'failed' ? 'failed' : 'processing';
  return {
    status,
    label: status === 'available' ? 'Available' : status === 'failed' ? 'Import failed' : 'Processing',
    attemptCount: Number(row.attempt_count),
    lastError: row.last_error,
    nextAttemptAt: row.next_attempt_at,
    documentId: row.document_id == null ? null : Number(row.document_id),
  };
}

export async function getEcwidPackingSlipIngestState(
  orgId: OrgId,
  orderId: number,
): Promise<PackingSlipIngestState | null> {
  const res = await tenantQuery<JobRow>(
    orgId,
    `SELECT id, order_id, status, attempt_count, next_attempt_at, document_id, last_error
       FROM outbound_document_ingest_jobs
      WHERE organization_id = $1
        AND provider = 'ecwid'
        AND order_id = $2
        AND document_type = 'packing_slip'
      LIMIT 1`,
    [orgId, orderId],
  );
  return res.rowCount === 0 ? null : projectEcwidPackingSlipJob(res.rows[0]);
}

/**
 * Backfill-safe enqueue: every missing ECWID slip gets exactly one durable job.
 * Existing available documents are projected as available without a provider call.
 */
export async function enqueueMissingEcwidPackingSlips(
  orgId: OrgId,
  limit = 250,
): Promise<number> {
  const res = await tenantQuery(
    orgId,
    `INSERT INTO outbound_document_ingest_jobs
       (organization_id, order_id, provider, document_type, status, document_id,
        completed_at, next_attempt_at, last_error, updated_at)
     SELECT o.organization_id,
            o.id,
            'ecwid',
            'packing_slip',
            CASE WHEN existing.id IS NULL THEN 'pending' ELSE 'available' END,
            existing.id,
            CASE WHEN existing.id IS NULL THEN NULL ELSE NOW() END,
            NOW(),
            NULL,
            NOW()
       FROM orders o
       LEFT JOIN LATERAL (
         SELECT d.id
           FROM document_entity_links l
           JOIN documents d
             ON d.id = l.document_id
            AND d.organization_id = l.organization_id
          WHERE l.organization_id = o.organization_id
            AND l.entity_type = 'ORDER'
            AND l.entity_id = o.id
            AND d.document_type = 'packing_slip'
          ORDER BY d.created_at DESC
          LIMIT 1
       ) existing ON TRUE
       LEFT JOIN outbound_document_ingest_jobs prior_job
         ON prior_job.organization_id = o.organization_id
        AND prior_job.provider = 'ecwid'
        AND prior_job.order_id = o.id
        AND prior_job.document_type = 'packing_slip'
      WHERE o.organization_id = $1
        AND LOWER(COALESCE(o.account_source, '')) LIKE '%ecwid%'
      ORDER BY CASE WHEN prior_job.id IS NULL THEN 0 ELSE 1 END, o.id ASC
      LIMIT $2
     ON CONFLICT (organization_id, provider, order_id, document_type)
     DO UPDATE SET
       status = CASE
         WHEN EXCLUDED.document_id IS NOT NULL THEN 'available'
         WHEN outbound_document_ingest_jobs.status = 'available' THEN 'available'
         ELSE outbound_document_ingest_jobs.status
       END,
       document_id = COALESCE(EXCLUDED.document_id, outbound_document_ingest_jobs.document_id),
       completed_at = CASE
         WHEN EXCLUDED.document_id IS NOT NULL THEN NOW()
         ELSE outbound_document_ingest_jobs.completed_at
       END,
       updated_at = NOW()
     RETURNING id`,
    [orgId, limit],
  );
  return res.rowCount ?? 0;
}

async function claimDueJob(orgId: OrgId): Promise<JobRow | null> {
  // A process can die after claiming a row. Return stale claims to the queue so
  // the durable worker heals without an operator or a second queue.
  await tenantQuery(
    orgId,
    `UPDATE outbound_document_ingest_jobs
        SET status = 'pending', next_attempt_at = NOW(), updated_at = NOW()
      WHERE organization_id = $1
        AND status = 'processing'
        AND last_attempt_at < NOW() - INTERVAL '10 minutes'`,
    [orgId],
  );
  const res = await tenantQuery<JobRow>(
    orgId,
    `WITH candidate AS (
       SELECT id
         FROM outbound_document_ingest_jobs
        WHERE organization_id = $1
          AND provider = 'ecwid'
          AND document_type = 'packing_slip'
          AND status IN ('pending', 'failed')
          AND next_attempt_at <= NOW()
        ORDER BY next_attempt_at ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
     )
     UPDATE outbound_document_ingest_jobs j
        SET status = 'processing',
            attempt_count = attempt_count + 1,
            last_attempt_at = NOW(),
            updated_at = NOW()
       FROM candidate
      WHERE j.id = candidate.id
      RETURNING j.id, j.order_id, j.status, j.attempt_count, j.next_attempt_at,
                j.document_id, j.last_error`,
    [orgId],
  );
  return res.rowCount === 0 ? null : res.rows[0];
}

async function completeJob(orgId: OrgId, jobId: number, documentId: number): Promise<void> {
  await tenantQuery(
    orgId,
    `UPDATE outbound_document_ingest_jobs
        SET status = 'available', document_id = $3, completed_at = NOW(),
            last_error = NULL, updated_at = NOW()
      WHERE id = $2 AND organization_id = $1`,
    [orgId, jobId, documentId],
  );
}

async function failJob(orgId: OrgId, job: JobRow, message: string): Promise<void> {
  const attempt = Math.max(1, Number(job.attempt_count));
  const retryMinutes = Math.min(360, 5 * 2 ** Math.min(attempt - 1, 6));
  await tenantQuery(
    orgId,
    `UPDATE outbound_document_ingest_jobs
        SET status = 'failed', last_error = $3,
            next_attempt_at = NOW() + ($4 * INTERVAL '1 minute'), updated_at = NOW()
      WHERE id = $2 AND organization_id = $1`,
    [orgId, Number(job.id), message.slice(0, 1000), retryMinutes],
  );
}

export interface EcwidPackingSlipDrainSummary {
  attempted: number;
  available: number;
  failed: number;
}

export async function drainEcwidPackingSlipJobs(
  orgId: OrgId,
  limit = 25,
): Promise<EcwidPackingSlipDrainSummary> {
  const summary: EcwidPackingSlipDrainSummary = { attempted: 0, available: 0, failed: 0 };
  for (let index = 0; index < limit; index += 1) {
    const job = await claimDueJob(orgId);
    if (!job) break;
    summary.attempted += 1;
    try {
      const result = await fetchOutboundDocuments(orgId, Number(job.order_id), ['packing_slip']);
      const document = result.fetched.find((item) => item.documentType === 'packing_slip');
      if (!document) {
        const message = result.failed.find((item) => item.type === 'packing_slip')?.error
          ?? 'ECWID packing slip was not returned';
        await failJob(orgId, job, message);
        summary.failed += 1;
        continue;
      }
      await completeJob(orgId, Number(job.id), document.id);
      summary.available += 1;
    } catch (error) {
      await failJob(
        orgId,
        job,
        error instanceof Error ? error.message : 'ECWID packing-slip import failed',
      );
      summary.failed += 1;
    }
  }
  return summary;
}

export async function runEcwidPackingSlipLifecycle(
  orgId: OrgId,
  options: { enqueueLimit?: number; drainLimit?: number } = {},
): Promise<EcwidPackingSlipDrainSummary & { enqueued: number }> {
  const enqueued = await enqueueMissingEcwidPackingSlips(orgId, options.enqueueLimit ?? 250);
  const drained = await drainEcwidPackingSlipJobs(orgId, options.drainLimit ?? 25);
  return { enqueued, ...drained };
}

export async function runEcwidPackingSlipLifecycleBatch(
  limitPerOrg = 25,
): Promise<{ orgs: number; enqueued: number; attempted: number; available: number; failed: number }> {
  const orgIds = await listSweepOrgIds();
  const summary = { orgs: orgIds.length, enqueued: 0, attempted: 0, available: 0, failed: 0 };
  for (const orgId of orgIds) {
    const result = await runEcwidPackingSlipLifecycle(orgId, { drainLimit: limitPerOrg });
    summary.enqueued += result.enqueued;
    summary.attempted += result.attempted;
    summary.available += result.available;
    summary.failed += result.failed;
  }
  return summary;
}
