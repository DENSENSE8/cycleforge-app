import pool from '@/lib/db';
import { orderTrackingMatchKeys } from '@/lib/tracking-format';
import { tenantQuery, tenantQueryOneTrip, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { sqlOrderOwnsShipment } from '@/lib/search/order-tracking-match-sql';

export type ExceptionSourceStation = 'tech' | 'packer' | 'verify' | 'mobile' | 'fba' | 'outbound';

/**
 * The stations whose open misses are the Fulfilled desk's "unmatched scans":
 * a pack scan (`packer`) or a dock scan-out (`outbound`) that matched no order.
 */
export const OPEN_UNMATCHED_SOURCE_STATIONS = ['packer', 'outbound'] as const;
export type UnmatchedScanSourceStation = (typeof OPEN_UNMATCHED_SOURCE_STATIONS)[number];

/** Membership of an open unmatched scan over `orders_exceptions <alias>`. The org filter is the caller's. */
export function sqlOpenUnmatchedScan(alias = 'oe'): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error(`invalid SQL alias: ${alias}`);
  return `(${alias}.status = 'open' AND ${alias}.source_station IN (${OPEN_UNMATCHED_SOURCE_STATIONS.map((s) => `'${s}'`).join(', ')}))`;
}

/** One open unmatched scan — what Fulfilled copies and paints for a dock miss. */
export interface OpenUnmatchedScan {
  id: number;
  tracking: string;
  sourceStation: UnmatchedScanSourceStation;
  staffId: number | null;
  staffName: string | null;
  /** PST wall clock, `YYYY-MM-DD HH24:MI:SS`. */
  createdAt: string;
  notes: string | null;
}

/** `GET /api/orders-exceptions/unmatched` response. */
export interface OpenUnmatchedScansResponse {
  count: number;
  scans: OpenUnmatchedScan[];
}

/** Every open unmatched scan in the org, newest first. */
export async function listOpenUnmatchedScans(orgId: OrgId): Promise<OpenUnmatchedScan[]> {
  const result = await tenantQuery<{
    id: number | string;
    tracking: string;
    source_station: UnmatchedScanSourceStation;
    staff_id: number | null;
    staff_name: string | null;
    created_at: string;
    notes: string | null;
  }>(
    orgId,
    `SELECT oe.id,
            oe.shipping_tracking_number AS tracking,
            oe.source_station,
            oe.staff_id,
            COALESCE(s.name, oe.staff_name) AS staff_name,
            to_char(oe.created_at AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI:SS') AS created_at,
            oe.notes
       FROM orders_exceptions oe
       LEFT JOIN staff s ON s.id = oe.staff_id AND s.organization_id = oe.organization_id
      WHERE oe.organization_id = $1
        AND ${sqlOpenUnmatchedScan('oe')}
      ORDER BY oe.created_at DESC, oe.id DESC`,
    [orgId],
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    tracking: String(row.tracking ?? '').trim(),
    sourceStation: row.source_station,
    staffId: row.staff_id != null ? Number(row.staff_id) : null,
    staffName: row.staff_name ?? null,
    createdAt: String(row.created_at ?? ''),
    notes: row.notes ?? null,
  }));
}

/** How many open unmatched scans the org holds — the count {@link listOpenUnmatchedScans} returns. */
export async function countOpenUnmatchedScans(orgId: OrgId): Promise<number> {
  const result = await tenantQuery<{ count: string | number }>(
    orgId,
    `SELECT COUNT(*)::int AS count
       FROM orders_exceptions oe
      WHERE oe.organization_id = $1
        AND ${sqlOpenUnmatchedScan('oe')}`,
    [orgId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export interface OrdersExceptionRecord {
  id: number;
  shipping_tracking_number: string;
  source_station: ExceptionSourceStation;
  staff_id: number | null;
  staff_name: string | null;
  exception_reason: string;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

let _tableEnsured = false;
type DbClient = {
  query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number }>;
};

export async function getOrderExceptionById(
  exceptionId: number,
  orgId: OrgId,
): Promise<OrdersExceptionRecord | null> {
  const result = await tenantQuery<OrdersExceptionRecord>(
    orgId,
    `SELECT id, shipping_tracking_number, source_station, staff_id, staff_name,
            exception_reason, notes, status,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
            to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
     FROM orders_exceptions
     WHERE id = $1 AND organization_id = $2
     LIMIT 1`,
    [exceptionId, orgId],
  );
  return result.rows[0] ?? null;
}

export type UpdateOrderExceptionTrackingResult =
  | { ok: true; before: OrdersExceptionRecord; after: OrdersExceptionRecord }
  | { ok: false; code: 'not_found' | 'invalid_tracking' | 'conflict'; message: string };

/**
 * Update the tracking number on a single `orders_exceptions` row. Rejects when
 * another open exception in the same org already owns the normalized key.
 */
export async function updateOrderExceptionTracking(
  exceptionId: number,
  shippingTrackingNumber: string,
  orgId: OrgId,
): Promise<UpdateOrderExceptionTrackingResult> {
  const {
    exact: tracking,
    key18: trackingKey18,
    last8: trackingLast8,
  } = orderTrackingMatchKeys(String(shippingTrackingNumber || '').trim());
  const normalizedLast8 = /^\d{8}$/.test(trackingLast8) ? trackingLast8 : null;
  if (!tracking || !trackingKey18) {
    return { ok: false, code: 'invalid_tracking', message: 'Tracking number is invalid' };
  }

  return withTenantTransaction(orgId, async (client) => {
    const beforeResult = await client.query(
      `SELECT id, shipping_tracking_number, source_station, staff_id, staff_name,
              exception_reason, notes, status,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
              to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
       FROM orders_exceptions
       WHERE id = $1 AND organization_id = $2
       LIMIT 1`,
      [exceptionId, orgId],
    );
    const before = beforeResult.rows[0] as OrdersExceptionRecord | undefined;
    if (!before) {
      return { ok: false as const, code: 'not_found' as const, message: 'Exception not found' };
    }

    const conflict = await client.query(
      `SELECT id
       FROM orders_exceptions
       WHERE status = 'open'
         AND organization_id = $3
         AND id <> $4
         AND (
           RIGHT(regexp_replace(UPPER(COALESCE(shipping_tracking_number, '')), '[^A-Z0-9]', '', 'g'), 18) = $1
           OR (
             $2::text IS NOT NULL
             AND RIGHT(regexp_replace(COALESCE(shipping_tracking_number, ''), '[^0-9]', '', 'g'), 8) = $2
           )
         )
       LIMIT 1`,
      [trackingKey18, normalizedLast8, orgId, exceptionId],
    );
    if ((conflict.rowCount ?? 0) > 0) {
      return {
        ok: false as const,
        code: 'conflict' as const,
        message: 'Tracking number already exists on another exception',
      };
    }

    const updated = await client.query(
      `UPDATE orders_exceptions
       SET shipping_tracking_number = $1,
           updated_at = NOW()
       WHERE id = $2 AND organization_id = $3
       RETURNING id, shipping_tracking_number, source_station, staff_id, staff_name,
                 exception_reason, notes, status,
                 to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
                 to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at`,
      [tracking, exceptionId, orgId],
    );
    const after = updated.rows[0] as OrdersExceptionRecord | undefined;
    if (!after) {
      return { ok: false as const, code: 'not_found' as const, message: 'Exception not found' };
    }
    return { ok: true as const, before, after };
  });
}

export async function findOrderByTrackingKey(
  shippingTrackingNumber: string,
  dbClient: DbClient = pool,
  orgId?: OrgId
): Promise<{ id: number; shipping_tracking_number: string } | null> {
  // Keep _tableEnsured variable for backwards compatibility with existing imports/tests.
  // Table creation is handled by migrations, not request-time DDL.
  _tableEnsured = true;

  // FedEx GS1 SoT — GS1 gun reads and sheet short STNs share one key before match.
  const {
    exact: canonical,
    key18: trackingKey18,
    last8: trackingLast8,
  } = orderTrackingMatchKeys(String(shippingTrackingNumber || '').trim());
  if (!canonical) return null;
  const normalizedLast8 = /^\d{8}$/.test(trackingLast8) ? trackingLast8 : null;
  if (!trackingKey18) return null;

  // Tenant-aware path (read-only probes: one round trip each, GUC + statement):
  if (orgId) {
    const ownsStn = sqlOrderOwnsShipment('o', 'stn.id');
    // Prefer exact STN normalized join (same as packing / receiving).
    const exact = await tenantQueryOneTrip(
      orgId,
      `SELECT
          o.id,
          stn.tracking_number_raw AS shipping_tracking_number
       FROM shipping_tracking_numbers stn
       JOIN orders o ON o.organization_id = $2 AND ${ownsStn}
       WHERE stn.tracking_number_normalized = $1
       ORDER BY o.id DESC
       LIMIT 1`,
      [canonical, orgId],
    );
    if (exact.rows[0]) {
      return exact.rows[0] as { id: number; shipping_tracking_number: string };
    }

    const ownsS2 = sqlOrderOwnsShipment('o', 's2.id');
    const tenantResult = await tenantQueryOneTrip(
      orgId,
      `SELECT
          o.id,
          COALESCE(stn.tracking_number_raw, s2.tracking_number_raw) AS shipping_tracking_number
       FROM orders o
       LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
       -- Independent lookup: find any stn row matching key18 (handles orders where
       -- shipment_id is null or points to a different legacy row)
       LEFT JOIN LATERAL (
           SELECT s.tracking_number_raw, s.id
           FROM shipping_tracking_numbers s
           WHERE RIGHT(regexp_replace(UPPER(s.tracking_number_normalized), '[^A-Z0-9]', '', 'g'), 18) = $1
              OR (
                $2::text IS NOT NULL
                AND RIGHT(regexp_replace(COALESCE(s.tracking_number_normalized, ''), '[^0-9]', '', 'g'), 8) = $2
              )
           ORDER BY s.id DESC LIMIT 1
       ) s2 ON TRUE
       WHERE o.organization_id = $3
         AND (
           (
             stn.id IS NOT NULL
             AND (
               RIGHT(regexp_replace(UPPER(stn.tracking_number_normalized), '[^A-Z0-9]', '', 'g'), 18) = $1
               OR (
                 $2::text IS NOT NULL
                 AND RIGHT(regexp_replace(COALESCE(stn.tracking_number_normalized, ''), '[^0-9]', '', 'g'), 8) = $2
               )
             )
           ) OR (
             s2.id IS NOT NULL AND ${ownsS2}
           )
         )
       ORDER BY o.id DESC
       LIMIT 1`,
      [trackingKey18, normalizedLast8, orgId]
    );

    return (tenantResult.rows[0] as { id: number; shipping_tracking_number: string } | undefined) || null;
  }

  const ownsStn = sqlOrderOwnsShipment('o', 'stn.id');
  const exact = await dbClient.query(
    `SELECT
        o.id,
        stn.tracking_number_raw AS shipping_tracking_number
     FROM shipping_tracking_numbers stn
     JOIN orders o ON ${ownsStn}
     WHERE stn.tracking_number_normalized = $1
     ORDER BY o.id DESC
     LIMIT 1`,
    [canonical],
  );
  if (exact.rows[0]) {
    return exact.rows[0] as { id: number; shipping_tracking_number: string };
  }

  const ownsS2 = sqlOrderOwnsShipment('o', 's2.id');
  const result = await dbClient.query(
    `SELECT
        o.id,
        COALESCE(stn.tracking_number_raw, s2.tracking_number_raw) AS shipping_tracking_number
     FROM orders o
     LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
     -- Independent lookup: find any stn row matching key18 (handles orders where
     -- shipment_id is null or points to a different legacy row)
     LEFT JOIN LATERAL (
         SELECT s.tracking_number_raw, s.id
         FROM shipping_tracking_numbers s
         WHERE RIGHT(regexp_replace(UPPER(s.tracking_number_normalized), '[^A-Z0-9]', '', 'g'), 18) = $1
            OR (
              $2::text IS NOT NULL
              AND RIGHT(regexp_replace(COALESCE(s.tracking_number_normalized, ''), '[^0-9]', '', 'g'), 8) = $2
            )
         ORDER BY s.id DESC LIMIT 1
     ) s2 ON TRUE
     WHERE (
         stn.id IS NOT NULL
         AND (
           RIGHT(regexp_replace(UPPER(stn.tracking_number_normalized), '[^A-Z0-9]', '', 'g'), 18) = $1
           OR (
             $2::text IS NOT NULL
             AND RIGHT(regexp_replace(COALESCE(stn.tracking_number_normalized, ''), '[^0-9]', '', 'g'), 8) = $2
           )
         )
     ) OR (
         s2.id IS NOT NULL AND ${ownsS2}
     )
     ORDER BY o.id DESC
     LIMIT 1`,
    [trackingKey18, normalizedLast8]
  );

  return result.rows[0] || null;
}

export async function upsertOpenOrderException(params: {
  /** Phase 3a: tenant scope for the orders_exceptions insert. */
  organizationId: string;
  shippingTrackingNumber: string;
  sourceStation: ExceptionSourceStation;
  staffId?: number | null;
  staffName?: string | null;
  reason?: string;
  notes?: string | null;
}, dbClient: DbClient = pool, orgId?: OrgId): Promise<{ exception: OrdersExceptionRecord | null; matchedOrderId: number | null }> {
  _tableEnsured = true;

  const rawTracking = String(params.shippingTrackingNumber || '').trim();
  if (rawTracking.includes(':')) {
    return { exception: null, matchedOrderId: null };
  }
  // Persist the canonical short key so exception sync matches sheet STNs without last8 timing.
  const {
    exact: tracking,
    key18: trackingKey18,
    last8: trackingLast8,
  } = orderTrackingMatchKeys(rawTracking);
  const normalizedLast8 = /^\d{8}$/.test(trackingLast8) ? trackingLast8 : null;
  if (!tracking || !trackingKey18) {
    return { exception: null, matchedOrderId: null };
  }

  // Thread orgId through to the shared matcher so the order lookup is tenant-scoped too.
  const matchedOrder = await findOrderByTrackingKey(tracking, dbClient, orgId);
  if (matchedOrder) {
    return { exception: null, matchedOrderId: matchedOrder.id };
  }

  // Tenant-aware path: scope the open-exception lookup + update to the caller's
  // org and stamp the INSERT inside a tenant transaction so the GUC is set.
  if (orgId) {
    return withTenantTransaction(orgId, async (client) => {
      const existing = await client.query(
        `SELECT *
         FROM orders_exceptions
         WHERE status = 'open'
           AND source_station = $2
           AND organization_id = $4
           AND (
             RIGHT(regexp_replace(UPPER(COALESCE(shipping_tracking_number, '')), '[^A-Z0-9]', '', 'g'), 18) = $1
             OR (
               $3::text IS NOT NULL
               AND RIGHT(regexp_replace(COALESCE(shipping_tracking_number, ''), '[^0-9]', '', 'g'), 8) = $3
             )
           )
         ORDER BY id DESC
         LIMIT 1`,
        [trackingKey18, params.sourceStation, normalizedLast8, orgId]
      );

      if (existing.rows.length > 0) {
        const existingRow = existing.rows[0];
        const updated = await client.query(
          `UPDATE orders_exceptions
           SET shipping_tracking_number = $1,
               source_station = $2,
               staff_id = COALESCE($3, staff_id),
               staff_name = COALESCE($4, staff_name),
               exception_reason = $5,
               notes = COALESCE($6, notes),
               updated_at = NOW()
           WHERE id = $7
             AND organization_id = $8
           RETURNING *`,
          [
            tracking,
            params.sourceStation,
            params.staffId ?? null,
            params.staffName ?? null,
            params.reason || 'not_found',
            params.notes ?? null,
            existingRow.id,
            orgId,
          ]
        );

        return { exception: updated.rows[0], matchedOrderId: null };
      }

      const inserted = await client.query(
        `INSERT INTO orders_exceptions (
          organization_id,
          shipping_tracking_number,
          source_station,
          staff_id,
          staff_name,
          exception_reason,
          notes,
          status,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', NOW(), NOW())
        RETURNING *`,
        [
          params.organizationId,
          tracking,
          params.sourceStation,
          params.staffId ?? null,
          params.staffName ?? null,
          params.reason || 'not_found',
          params.notes ?? null,
        ]
      );

      return { exception: inserted.rows[0], matchedOrderId: null };
    });
  }

  const existing = await dbClient.query(
    `SELECT *
     FROM orders_exceptions
     WHERE status = 'open'
       AND source_station = $2
       AND (
         RIGHT(regexp_replace(UPPER(COALESCE(shipping_tracking_number, '')), '[^A-Z0-9]', '', 'g'), 18) = $1
         OR (
           $3::text IS NOT NULL
           AND RIGHT(regexp_replace(COALESCE(shipping_tracking_number, ''), '[^0-9]', '', 'g'), 8) = $3
         )
       )
     ORDER BY id DESC
     LIMIT 1`,
    [trackingKey18, params.sourceStation, normalizedLast8]
  );

  if (existing.rows.length > 0) {
    const existingRow = existing.rows[0];
    const updated = await dbClient.query(
      `UPDATE orders_exceptions
       SET shipping_tracking_number = $1,
           source_station = $2,
           staff_id = COALESCE($3, staff_id),
           staff_name = COALESCE($4, staff_name),
           exception_reason = $5,
           notes = COALESCE($6, notes),
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        tracking,
        params.sourceStation,
        params.staffId ?? null,
        params.staffName ?? null,
        params.reason || 'not_found',
        params.notes ?? null,
        existingRow.id,
      ]
    );

    return { exception: updated.rows[0], matchedOrderId: null };
  }

  const inserted = await dbClient.query(
    `INSERT INTO orders_exceptions (
      organization_id,
      shipping_tracking_number,
      source_station,
      staff_id,
      staff_name,
      exception_reason,
      notes,
      status,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', NOW(), NOW())
    RETURNING *`,
    [
      params.organizationId,
      tracking,
      params.sourceStation,
      params.staffId ?? null,
      params.staffName ?? null,
      params.reason || 'not_found',
      params.notes ?? null,
    ]
  );

  return { exception: inserted.rows[0], matchedOrderId: null };
}

export type { OrderExceptionResolutionDetail } from '@/lib/orders-sync/types';
import type { OrderExceptionResolutionDetail, SyncProgress } from '@/lib/orders-sync/types';

const noopProgress: SyncProgress = () => {};

/** What one exception sweep did. */
export interface OrderExceptionSyncResult {
  scanned: number;
  matched: number;
  deleted: number;
  resolved: OrderExceptionResolutionDetail[];
  stillOpen: OrderExceptionResolutionDetail[];
}

/**
 * Resolve open exceptions to the orders that now carry their tracking. Callers
 * go through `syncOrderExceptionsWithScanOutReplay` (`@/lib/outbound/held-scan-out-replay`),
 * which also completes the scan-out of each resolved dock miss.
 */
export async function syncOrderExceptionsToOrders(
  progress: SyncProgress = noopProgress,
  orgId?: OrgId,
): Promise<OrderExceptionSyncResult> {
  _tableEnsured = true;

  // Hard cap so a single sync doesn't churn through thousands of stale rows.
  // Older exceptions get processed on subsequent runs.
  const EXCEPTIONS_SYNC_BATCH_LIMIT = 100;
  const openExceptions = orgId
    ? await tenantQuery(
        orgId,
        `SELECT id, shipping_tracking_number, source_station
         FROM orders_exceptions
         WHERE status = 'open'
           AND organization_id = $2
         ORDER BY id DESC
         LIMIT $1`,
        [EXCEPTIONS_SYNC_BATCH_LIMIT, orgId]
      )
    : await pool.query(
        `SELECT id, shipping_tracking_number, source_station
         FROM orders_exceptions
         WHERE status = 'open'
         ORDER BY id DESC
         LIMIT $1`,
        [EXCEPTIONS_SYNC_BATCH_LIMIT]
      );

  let matched = 0;
  let deleted = 0;
  const resolved: OrderExceptionResolutionDetail[] = [];
  const stillOpen: OrderExceptionResolutionDetail[] = [];

  progress({ type: 'phase', phase: 'scanning_exceptions', count: openExceptions.rows.length });

  for (const row of openExceptions.rows) {
    const rawTracking = String(row.shipping_tracking_number || '');
    const { exact: canonical, key18: trackingKey18 } = orderTrackingMatchKeys(rawTracking);
    if (!trackingKey18) {
      const detail = {
        exceptionId: row.id as number,
        tracking: rawTracking,
        sourceStation: row.source_station ?? null,
      };
      stillOpen.push(detail);
      progress({ type: 'exception', kind: 'open', row: detail });
      continue;
    }

    // Use the shared matcher so we pick up exact-canonical + last-8 fallback and the independent shipment_id lookup.
    const order = await findOrderByTrackingKey(canonical, pool, orgId);
    if (!order) {
      const detail = {
        exceptionId: row.id as number,
        tracking: rawTracking,
        sourceStation: row.source_station ?? null,
      };
      stillOpen.push(detail);
      progress({ type: 'exception', kind: 'open', row: detail });
      continue;
    }

    matched += 1;
    const detail = {
      exceptionId: row.id as number,
      tracking: rawTracking,
      matchedOrderId: order.id,
      sourceStation: row.source_station ?? null,
    };
    resolved.push(detail);
    progress({ type: 'exception', kind: 'resolved', row: detail });

    // Update status only — shipped state is derived from shipping_tracking_numbers.
    if (orgId) {
      await tenantQuery(
        orgId,
        `UPDATE orders o
         SET status = CASE
               WHEN EXISTS (
                 SELECT 1 FROM packer_logs pl
                 JOIN   shipping_tracking_numbers stn ON stn.id = pl.shipment_id
                 WHERE  RIGHT(regexp_replace(UPPER(COALESCE(stn.tracking_number_normalized, '')), '[^A-Z0-9]', '', 'g'), 18) = $1
                   AND  pl.tracking_type = 'ORDERS'
                   AND  pl.completion_state = 'COMPLETED'
                   AND  pl.organization_id = $3
               ) THEN 'packed'
               ELSE status
             END
         WHERE o.id = $2
           AND o.organization_id = $3`,
        [trackingKey18, order.id, orgId]
      );
    } else {
      await pool.query(
        `UPDATE orders
         SET status = CASE
               WHEN EXISTS (
                 SELECT 1 FROM packer_logs pl
                 JOIN   shipping_tracking_numbers stn ON stn.id = pl.shipment_id
                 WHERE  RIGHT(regexp_replace(UPPER(COALESCE(stn.tracking_number_normalized, '')), '[^A-Z0-9]', '', 'g'), 18) = $1
                   AND  pl.tracking_type = 'ORDERS'
                   AND  pl.completion_state = 'COMPLETED'
               ) THEN 'packed'
               ELSE status
             END
         WHERE id = $2`,
        [trackingKey18, order.id]
      );
    }

    // Mark as resolved instead of deleting — station_scan_sessions holds FK
    // references to orders_exceptions rows, so deletion would violate the
    // constraint. Keeping resolved rows preserves the audit trail.
    const resolvedResult = orgId
      ? await tenantQuery(
          orgId,
          `UPDATE orders_exceptions SET status = 'resolved', updated_at = NOW() WHERE id = $1 AND organization_id = $2`,
          [row.id, orgId]
        )
      : await pool.query(
          `UPDATE orders_exceptions SET status = 'resolved', updated_at = NOW() WHERE id = $1`,
          [row.id]
        );

    deleted += resolvedResult.rowCount || 0;
  }

  progress({ type: 'phase', phase: 'done' });

  return {
    scanned: openExceptions.rows.length,
    matched,
    deleted,
    resolved,
    stillOpen,
  };
}
