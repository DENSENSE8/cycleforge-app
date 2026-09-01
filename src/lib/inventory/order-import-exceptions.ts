/**
 * Review · Missing item number — enqueue on sheet-import `noItemNumber` skip,
 * list/resolve/ignore for `/review?mode=catalog-link`.
 *
 * Sibling of order-catalog-link-chores.ts. Only rows explicitly upserted here
 * appear in the queue (no historical orphan scan).
 *
 * "Resolve" does not hand-build an order: it splices the operator-supplied
 * Item Number into the ORIGINAL stored sheet row and re-runs the exact same
 * mapSheetRowsToCanonicalLines + ingestCanonicalOrders path a normal sync
 * uses, so a resolved row can never diverge from what a real import would
 * have produced.
 */

import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import {
  mapSheetRowsToCanonicalLines,
  type SheetRow,
  type SheetColumnIndices,
} from '@/lib/orders/sources/google-sheet-rows';
import type { CanonicalOrderLine } from '@/lib/orders/canonical-order';
import { ingestCanonicalOrders } from '@/lib/orders/ingest-canonical-orders';
import type {
  ImportExceptionRow,
  ImportExceptionStatus,
} from '@/features/review/catalog-link/import-exception-types';

export type EnqueueImportExceptionInput = {
  accountOrderId: string;
  accountSource?: string | null;
  productTitle?: string | null;
  tracking?: string | null;
  sheetRow?: number | null;
  rawRow: SheetRow;
  colIndices: SheetColumnIndices;
};

/** Injectable collaborators (real impls by default; fakes in tests). */
export type ImportExceptionDeps = {
  query: <T extends QueryResultRow = QueryResultRow>(
    orgId: OrgId,
    text: string,
    params?: ReadonlyArray<unknown>,
  ) => Promise<QueryResult<T>>;
  withTx: <T>(orgId: OrgId, fn: (client: Pick<PoolClient, 'query'>) => Promise<T>) => Promise<T>;
  ingest: (
    lines: CanonicalOrderLine[],
    opts: { orgId: OrgId; source: string },
  ) => Promise<{ insertedOrderIds: number[] }>;
  invalidate?: (orgId: OrgId, tags: string[]) => Promise<unknown>;
};

const defaultDeps: ImportExceptionDeps = {
  query: tenantQuery,
  withTx: withTenantTransaction,
  ingest: ingestCanonicalOrders,
  invalidate: invalidateCacheTags,
};

/**
 * Upsert an open exception per underlying sale. Re-syncs bump seen_count /
 * last_seen and refresh the raw-row snapshot ONLY while still open — a
 * resolved or ignored row is left alone (`WHERE status = 'open'`), because the
 * source sheet cell is never edited by this feature and would otherwise
 * resurface forever.
 */
export async function enqueueImportExceptionsForImport(
  orgId: OrgId,
  rows: EnqueueImportExceptionInput[],
  deps: ImportExceptionDeps = defaultDeps,
): Promise<number> {
  if (rows.length === 0) return 0;

  const merged = new Map<string, EnqueueImportExceptionInput>();
  for (const row of rows) {
    const accountOrderId = row.accountOrderId.trim();
    if (!accountOrderId) continue;
    const accountSource = (row.accountSource || '').trim();
    const key = `${accountSource}::${accountOrderId}`;
    // Last write wins for a given order id within one import batch — there is
    // only ever one sheet row per order, so a collision means a re-read, not
    // two distinct sales.
    merged.set(key, { ...row, accountOrderId, accountSource });
  }

  for (const row of merged.values()) {
    await deps.query(
      orgId,
      `INSERT INTO order_import_exceptions
         (organization_id, account_order_id, account_source, product_title,
          tracking, raw_row, col_indices, sheet_row, status, first_seen_at,
          last_seen_at, seen_count, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', now(), now(), 1, now())
       ON CONFLICT (organization_id, account_source, account_order_id)
       DO UPDATE SET
         product_title = COALESCE(EXCLUDED.product_title, order_import_exceptions.product_title),
         tracking = COALESCE(EXCLUDED.tracking, order_import_exceptions.tracking),
         raw_row = EXCLUDED.raw_row,
         col_indices = EXCLUDED.col_indices,
         sheet_row = EXCLUDED.sheet_row,
         last_seen_at = now(),
         seen_count = order_import_exceptions.seen_count + 1,
         updated_at = now()
       WHERE order_import_exceptions.status = 'open'`,
      [
        orgId,
        row.accountOrderId,
        row.accountSource || '',
        (row.productTitle || '').trim() || null,
        (row.tracking || '').trim() || null,
        JSON.stringify(row.rawRow),
        JSON.stringify(row.colIndices),
        row.sheetRow ?? null,
      ],
    );
  }

  return merged.size;
}

export async function listOpenImportExceptions(
  orgId: OrgId,
  opts: { limit?: number; offset?: number; q?: string } = {},
  deps: ImportExceptionDeps = defaultDeps,
): Promise<{ rows: ImportExceptionRow[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  const q = (opts.q || '').trim();

  const params: (string | number)[] = [orgId, limit, offset];
  let searchClause = '';
  if (q) {
    params.push(`%${q}%`);
    searchClause = `AND (account_order_id ILIKE $4 OR product_title ILIKE $4 OR tracking ILIKE $4 OR account_source ILIKE $4)`;
  }

  const result = await deps.query<{
    id: number;
    account_order_id: string;
    account_source: string;
    product_title: string | null;
    tracking: string | null;
    status: string;
    sheet_row: number | null;
    resolved_item_number: string | null;
    resolved_order_id: number | null;
    seen_count: number;
    first_seen_at: Date;
    last_seen_at: Date;
  }>(
    orgId,
    `SELECT id, account_order_id, account_source, product_title, tracking,
            status, sheet_row, resolved_item_number, resolved_order_id,
            seen_count, first_seen_at, last_seen_at
       FROM order_import_exceptions
      WHERE organization_id = $1
        AND status = 'open'
        ${searchClause}
      ORDER BY last_seen_at DESC
      LIMIT $2 OFFSET $3`,
    params,
  );

  const countParams: (string | number)[] = [orgId];
  let countSearch = '';
  if (q) {
    countParams.push(`%${q}%`);
    countSearch = `AND (account_order_id ILIKE $2 OR product_title ILIKE $2 OR tracking ILIKE $2 OR account_source ILIKE $2)`;
  }
  const countResult = await deps.query<{ total: number }>(
    orgId,
    `SELECT COUNT(*)::int AS total
       FROM order_import_exceptions
      WHERE organization_id = $1 AND status = 'open' ${countSearch}`,
    countParams,
  );

  return {
    rows: result.rows.map((r) => ({
      id: Number(r.id),
      accountOrderId: r.account_order_id,
      accountSource: r.account_source,
      productTitle: r.product_title,
      tracking: r.tracking,
      status: r.status as ImportExceptionStatus,
      sheetRow: r.sheet_row,
      resolvedItemNumber: r.resolved_item_number,
      resolvedOrderId: r.resolved_order_id,
      seenCount: Number(r.seen_count),
      firstSeenAt: new Date(r.first_seen_at).toISOString(),
      lastSeenAt: new Date(r.last_seen_at).toISOString(),
    })),
    total: Number(countResult.rows[0]?.total ?? 0),
  };
}

export async function ignoreImportException(
  orgId: OrgId,
  id: number,
  deps: ImportExceptionDeps = defaultDeps,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const result = await deps.query(
    orgId,
    `UPDATE order_import_exceptions
        SET status = 'ignored',
            ignored_at = now(),
            updated_at = now()
      WHERE id = $1
        AND organization_id = $2
        AND status = 'open'
      RETURNING id`,
    [id, orgId],
  );
  if (!result.rows[0]) {
    return { ok: false, error: 'Exception not found or not open', status: 404 };
  }
  return { ok: true };
}

export async function resolveImportException(
  orgId: OrgId,
  params: { id: number; itemNumber: string },
  deps: ImportExceptionDeps = defaultDeps,
): Promise<
  | { ok: true; orderId: number | null }
  | { ok: false; error: string; status: number }
> {
  const itemNumber = params.itemNumber.trim();
  if (!itemNumber) {
    return { ok: false, error: 'Item Number is required', status: 400 };
  }

  const found = await deps.query<{
    id: number;
    status: string;
    raw_row: SheetRow;
    col_indices: SheetColumnIndices;
  }>(
    orgId,
    `SELECT id, status, raw_row, col_indices
       FROM order_import_exceptions
      WHERE id = $1 AND organization_id = $2
      LIMIT 1`,
    [params.id, orgId],
  );
  const row = found.rows[0];
  if (!row) return { ok: false, error: 'Exception not found', status: 404 };
  if (row.status !== 'open') {
    return { ok: false, error: 'Exception is not open', status: 409 };
  }

  const colIndices = row.col_indices;
  const rawRow = row.raw_row.slice();
  if (colIndices.itemNumber < 0) {
    return { ok: false, error: 'This import has no Item Number column', status: 409 };
  }
  rawRow[colIndices.itemNumber] = itemNumber;

  const [line] = mapSheetRowsToCanonicalLines([rawRow], colIndices);
  const ingestResult = await deps.ingest([line], {
    orgId,
    source: 'review-import-exception',
  });
  const orderId = ingestResult.insertedOrderIds[0] ?? null;

  const updated = await deps.withTx(orgId, async (client) => {
    const result = await client.query(
      `UPDATE order_import_exceptions
          SET status = 'resolved',
              resolved_item_number = $1,
              resolved_order_id = $2,
              resolved_at = now(),
              updated_at = now()
        WHERE id = $3
          AND organization_id = $4
          AND status = 'open'
        RETURNING id`,
      [itemNumber, orderId, params.id, orgId],
    );
    return result.rows[0] ?? null;
  });

  if (!updated) {
    return { ok: false, error: 'Exception is not open', status: 409 };
  }

  // Ingest already fired order.imported for a newly inserted order. When the
  // resolve path only backfills an existing row, ingest's item_number backfill
  // arm also fires order.item_number_set. If orderId is known, fire once more
  // defensively for the resolve actor (idempotent when already assigned).
  if (orderId != null) {
    try {
      const { applyListingAssignment, loadOrderListingFacts } = await import(
        '@/lib/automations/apply-listing-assignment'
      );
      const facts = await loadOrderListingFacts(orgId, orderId);
      if (facts) {
        await applyListingAssignment({
          organizationId: orgId,
          orderId,
          triggerKey: 'order.item_number_set',
          facts: { ...facts, item_number: itemNumber },
        });
      }
    } catch (err) {
      console.warn('[resolveImportException] listing automation skipped:', err);
    }
  }

  await (deps.invalidate ?? invalidateCacheTags)(orgId, [CACHE_TAGS.orders]).catch(() => {});

  return { ok: true, orderId };
}
