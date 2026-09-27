/** pending-skus.ts — the "create in Zoho" to-do queue (relational-reuse plan P3 §7). */

import pool from '@/lib/db';
import type { PoolClient } from 'pg';
import { resolveSkuCatalogId } from '@/lib/neon/sku-catalog-queries';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';

type PendingSkuStatus = 'PENDING' | 'CREATED' | 'IGNORED' | 'DUPLICATE';
type PendingSkuSource = 'sku_stock' | 'orders' | 'receiving' | 'scan' | 'ledger' | (string & {});

interface PendingSkuRow {
  id: number;
  normalized_sku: string;
  raw_sku: string;
  status: PendingSkuStatus;
  occurrences: number;
  first_source: string | null;
  suggested_title: string | null;
  sku_catalog_id: number | null;
  resolved_at: string | null;
  assigned_to: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface QueuePendingSkuInput {
  rawSku: string;
  source?: PendingSkuSource | null;
  suggestedTitle?: string | null;
}

/** Record an unmatched SKU in the queue (idempotent). */
export async function queuePendingSku(
  input: QueuePendingSkuInput,
  executor: Pick<PoolClient, 'query'> = pool,
): Promise<PendingSkuRow | null> {
  const raw = (input.rawSku ?? '').trim();
  if (!raw) return null;

  const result = await executor.query<PendingSkuRow>(
    `INSERT INTO pending_skus (normalized_sku, raw_sku, first_source, suggested_title)
     VALUES (fn_normalize_sku($1), $1, $2, $3)
     ON CONFLICT (normalized_sku) DO UPDATE SET
       occurrences     = pending_skus.occurrences + 1,
       first_source    = COALESCE(pending_skus.first_source, EXCLUDED.first_source),
       suggested_title = COALESCE(pending_skus.suggested_title, EXCLUDED.suggested_title),
       updated_at      = now()
     RETURNING *`,
    [raw, input.source ?? null, input.suggestedTitle ?? null],
  );
  return result.rows[0] ?? null;
}

interface ResolveOrQueueInput {
  sku?: string | null;
  itemNumber?: string | null;
  source?: PendingSkuSource | null;
  suggestedTitle?: string | null;
}

/** Resolve a SKU to its canonical sku_catalog_id through the existing crosswalk chain (direct → platform xref). */
async function resolveSkuCatalogIdOrQueue(
  input: ResolveOrQueueInput,
): Promise<{ skuCatalogId: number | null; queued: boolean }> {
  const id = await resolveSkuCatalogId(input.sku ?? null, input.itemNumber ?? null);
  if (id) return { skuCatalogId: id, queued: false };

  const raw = (input.sku ?? '').trim();
  if (!raw) return { skuCatalogId: null, queued: false };

  await queuePendingSku({ rawSku: raw, source: input.source ?? null, suggestedTitle: input.suggestedTitle ?? null });
  return { skuCatalogId: null, queued: true };
}

interface ListPendingSkusOptions {
  status?: PendingSkuStatus;
  limit?: number;
}

/** The to-do list — PENDING rows ordered by how often they block work. */
export async function listPendingSkus(orgId: OrgId, opts: ListPendingSkusOptions = {}): Promise<PendingSkuRow[]> {
  const status = opts.status ?? 'PENDING';
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 1000);
  const result = await tenantQuery<PendingSkuRow>(
    orgId,
    `SELECT * FROM pending_skus
      WHERE status = $1
      ORDER BY occurrences DESC, created_at ASC
      LIMIT $2`,
    [status, limit],
  );
  return result.rows;
}

/** Steward action: drop a junk SKU from the to-do list (e.g. 'No data', typo). */
export async function ignorePendingSku(orgId: OrgId, id: number, notes?: string | null): Promise<PendingSkuRow | null> {
  const result = await tenantQuery<PendingSkuRow>(
    orgId,
    `UPDATE pending_skus
        SET status = 'IGNORED', notes = COALESCE($2, notes), updated_at = now()
      WHERE id = $1 AND status = 'PENDING'
      RETURNING *`,
    [id, notes ?? null],
  );
  return result.rows[0] ?? null;
}

/**
 * Backstop reconcile for an already-existing catalog row (the trigger covers
 * new INSERTs; this catches SKUs created before they were queued, or a sweep).
 * Resolves any PENDING rows whose normalized form matches the given catalog sku.
 */
async function reconcilePendingForCatalog(
  catalogId: number,
  catalogSku: string,
): Promise<number> {
  const result = await pool.query(
    `UPDATE pending_skus
        SET sku_catalog_id = $1, status = 'CREATED', resolved_at = now(), updated_at = now()
      WHERE status = 'PENDING' AND normalized_sku = fn_normalize_sku($2)`,
    [catalogId, catalogSku],
  );
  return result.rowCount ?? 0;
}
