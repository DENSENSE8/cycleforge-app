import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

/**
 * `square_transactions` — tenant-scoped access.
 *
 * The table carries `organization_id NOT NULL`, FORCE row-level security, and
 * the canonical `tenant_isolation` policy bound to `app.current_org`. Every
 * query below therefore goes through the tenant helpers, which open the
 * connection with `SET LOCAL app.current_org` for the duration of the statement.
 *
 * **`orgId` is REQUIRED on every export and there is deliberately no raw-pool
 * fallback.** The app pool connects as a BYPASSRLS role today, so an unscoped
 * `pool.query` here does not merely leave the GUC unset — it steps around the
 * FORCE policy entirely and reads/writes across every tenant. A defaulted or
 * optional org on a call that decides which tenant's money a row belongs to is
 * a silent opt-out, and the sites you forget are exactly the ones the compiler
 * stays quiet about (`.claude/rules/backend-patterns.md`). The explicit
 * `organization_id` predicates below hold the line independently of whichever
 * role the pool happens to connect as.
 *
 * ⚠️ DEPLOY ORDER: `insertSquareTransaction` conflicts on
 * `(organization_id, square_order_id)`, which requires the composite unique
 * added by `src/lib/migrations/2026-07-29a_square_transactions_tenant_contract.sql`.
 * Apply that migration BEFORE deploying this module, or every upsert throws
 * "no unique or exclusion constraint matching the ON CONFLICT specification".
 */

export interface SquareTransactionRecord {
  id: string;
  square_order_id: string;
  square_payment_id: string | null;
  square_customer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  line_items: Array<{
    name: string;
    sku: string | null;
    quantity: string;
    price: number;
  }>;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  discount: number;
  status: string;
  payment_method: string | null;
  receipt_url: string | null;
  order_source: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  synced_at: string;
}

export async function getSquareTransactions(params: {
  search?: string;
  status?: string;
  weekStart?: string;
  weekEnd?: string;
  orderSource?: string;
  limit?: number;
}, orgId: OrgId): Promise<SquareTransactionRecord[]> {
  const { search, status, weekStart, weekEnd, orderSource, limit = 200 } = params;
  const safeLimit = Math.max(1, Math.min(500, limit));

  // Always applied: hide soft-deleted (operator-removed) sales, and scope to
  // the caller's org explicitly rather than relying on the RLS policy alone.
  const conditions: string[] = ['deleted_at IS NULL', 'organization_id = $1'];
  const values: unknown[] = [orgId];
  let paramIndex = 2;

  if (search) {
    conditions.push(
      `(customer_name ILIKE $${paramIndex} OR customer_phone ILIKE $${paramIndex} OR customer_email ILIKE $${paramIndex} OR square_order_id ILIKE $${paramIndex} OR line_items::text ILIKE $${paramIndex})`,
    );
    values.push(`%${search}%`);
    paramIndex++;
  }

  if (status) {
    conditions.push(`status = $${paramIndex}`);
    values.push(status);
    paramIndex++;
  }

  if (weekStart) {
    conditions.push(`created_at >= $${paramIndex}::date`);
    values.push(weekStart);
    paramIndex++;
  }

  if (weekEnd) {
    conditions.push(`created_at < ($${paramIndex}::date + interval '1 day')`);
    values.push(weekEnd);
    paramIndex++;
  }

  if (orderSource) {
    conditions.push(`order_source = $${paramIndex}`);
    values.push(orderSource);
    paramIndex++;
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  values.push(safeLimit);
  const sql = `SELECT * FROM square_transactions ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex}`;
  const result = await tenantQuery<SquareTransactionRecord>(orgId, sql, values);

  return result.rows;
}

export async function getSquareTransactionById(
  id: string,
  orgId: OrgId,
): Promise<SquareTransactionRecord | null> {
  const result = await tenantQuery<SquareTransactionRecord>(
    orgId,
    'SELECT * FROM square_transactions WHERE id = $1 AND organization_id = $2 LIMIT 1',
    [id, orgId],
  );
  return result.rows[0] || null;
}

/**
 * Soft-delete a walk-in sale (set deleted_at). Square stays the system of
 * record — the row is only hidden locally; re-syncs preserve the flag because
 * the upsert's ON CONFLICT never touches deleted_at. Returns the hidden row,
 * or null if it didn't exist / was already hidden.
 */
export async function softDeleteSquareTransaction(
  id: string,
  orgId: OrgId,
): Promise<SquareTransactionRecord | null> {
  const sql = `UPDATE square_transactions
        SET deleted_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      RETURNING *`;
  return withTenantTransaction(orgId, async (client) => {
    const result = await client.query<SquareTransactionRecord>(sql, [id, orgId]);
    return result.rows[0] || null;
  });
}

export async function insertSquareTransaction(data: {
  square_order_id: string;
  square_payment_id?: string | null;
  square_customer_id?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  line_items: unknown[];
  subtotal?: number | null;
  tax?: number | null;
  total?: number | null;
  discount?: number;
  status?: string;
  payment_method?: string | null;
  receipt_url?: string | null;
  order_source?: string;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string | null;
}, orgId: OrgId): Promise<SquareTransactionRecord> {
  const sql = `INSERT INTO square_transactions (
      organization_id,
      square_order_id, square_payment_id, square_customer_id,
      customer_name, customer_email, customer_phone,
      line_items, subtotal, tax, total, discount,
      status, payment_method, receipt_url, order_source,
      notes, created_by, created_at
    ) VALUES (
      $1,
      $2, $3, $4, $5, $6, $7,
      $8::jsonb, $9, $10, $11, $12,
      $13, $14, $15, $16,
      $17, $18, COALESCE($19::timestamptz, now())
    )
    ON CONFLICT (organization_id, square_order_id) DO UPDATE SET
      square_payment_id = COALESCE(EXCLUDED.square_payment_id, square_transactions.square_payment_id),
      status = COALESCE(EXCLUDED.status, square_transactions.status),
      receipt_url = COALESCE(EXCLUDED.receipt_url, square_transactions.receipt_url),
      created_at = COALESCE(EXCLUDED.created_at, square_transactions.created_at),
      synced_at = now()
    RETURNING *`;
  const values = [
    orgId,
    data.square_order_id,
    data.square_payment_id ?? null,
    data.square_customer_id ?? null,
    data.customer_name ?? null,
    data.customer_email ?? null,
    data.customer_phone ?? null,
    JSON.stringify(data.line_items),
    data.subtotal ?? null,
    data.tax ?? null,
    data.total ?? null,
    data.discount ?? 0,
    data.status ?? 'completed',
    data.payment_method ?? null,
    data.receipt_url ?? null,
    data.order_source ?? 'walk_in_sale',
    data.notes ?? null,
    data.created_by ?? null,
    data.created_at ?? null,
  ];

  return withTenantTransaction(orgId, async (client) => {
    const result = await client.query<SquareTransactionRecord>(sql, values);
    return result.rows[0];
  });
}
