/** Resolve an unmatched pack scan (an open `orders_exceptions` row) from the package record — `POST /api/shipments/[id]/resolve-exception`. */

import type { PoolClient } from 'pg';
import pool from '@/lib/db';
import { withIdempotencyClaim } from '@/lib/api-idempotency';
import { computePackerLogEnrichment } from '@/lib/neon/packer-log-enrichment';
import { linkShipment } from '@/lib/shipping/shipment-links';
import type { OrgId } from '@/lib/tenancy/constants';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { orderTrackingMatchKeys } from '@/lib/tracking-format';
import {
  SHIPMENT_EXCEPTIONS_SQL,
  getShipmentRecord,
  readVisibleShipment,
  type ShipmentExceptionRow,
} from './shipment-record';
import type {
  ResolveShipmentExceptionBody,
  ResolveShipmentExceptionResult,
  ShipmentRecord,
} from './shipment-record-types';

export const RESOLVE_SHIPMENT_EXCEPTION_ROUTE = 'shipments.resolve-exception';

export interface ResolveTarget {
  tracking: string;
  openExceptionId: number | null;
}

export interface ResolveApplied {
  exceptionId: number;
  kind: ResolveShipmentExceptionBody['kind'];
  orderRowId: number | null;
  orderRef: string | null;
  /** `shipment_links.role` written by a link; null for a close. */
  linkRole: 'ORDER_PRIMARY' | 'ORDER_SPLIT' | null;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

export type ApplyResult = { ok: true; applied: ResolveApplied } | { ok: false; code: 'not_open' | 'order_not_found' };

export interface LinkOrderInput {
  shipmentId: number;
  exceptionId: number;
  orderRowId: number;
  staffId: number | null;
  clientEventId: string;
}

export interface CloseInput {
  shipmentId: number;
  exceptionId: number;
  reason: string;
  staffId: number | null;
}

type ClaimBody = Record<string, unknown>;

export interface ResolveShipmentExceptionDeps {
  /** Idempotency claim around the whole write; `cached` = a replayed response. */
  claim: (
    args: { orgId: OrgId; staffId: number | null; key: string },
    produce: () => Promise<{ status: number; body: ClaimBody }>,
  ) => Promise<{ status: number; body: ClaimBody; cached: boolean }>;
  loadTarget: (orgId: OrgId, shipmentId: number) => Promise<ResolveTarget | null>;
  linkOrder: (orgId: OrgId, input: LinkOrderInput) => Promise<ApplyResult>;
  close: (orgId: OrgId, input: CloseInput) => Promise<ApplyResult>;
  getRecord: (orgId: OrgId, shipmentId: number) => Promise<ShipmentRecord | null>;
}

export type ResolveShipmentExceptionOutcome =
  | { status: 404 | 409; error: string }
  | {
      status: 200;
      result: ResolveShipmentExceptionResult;
      /** What this call wrote — null on an idempotent replay (nothing to audit). */
      applied: ResolveApplied | null;
    };

export interface ResolveShipmentExceptionArgs {
  orgId: OrgId;
  staffId: number | null;
  shipmentId: number;
  body: ResolveShipmentExceptionBody;
}

export async function resolveShipmentException(
  args: ResolveShipmentExceptionArgs,
  deps: ResolveShipmentExceptionDeps = defaultDeps,
): Promise<ResolveShipmentExceptionOutcome> {
  const { orgId, staffId, shipmentId, body } = args;
  let applied: ResolveApplied | null = null;

  const claimed = await deps.claim(
    { orgId, staffId, key: `${shipmentId}:${body.clientEventId}` },
    async () => {
      const target = await deps.loadTarget(orgId, shipmentId);
      if (!target) return { status: 404, body: { error: 'Package not found' } };
      if (target.openExceptionId == null) {
        return { status: 409, body: { error: 'This package has no open exception' } };
      }
      const res =
        body.kind === 'link-order'
          ? await deps.linkOrder(orgId, {
              shipmentId,
              exceptionId: target.openExceptionId,
              orderRowId: body.orderRowId,
              staffId,
              clientEventId: body.clientEventId,
            })
          : await deps.close(orgId, {
              shipmentId,
              exceptionId: target.openExceptionId,
              reason: body.reason,
              staffId,
            });
      if (!res.ok) {
        return res.code === 'order_not_found'
          ? { status: 404, body: { error: 'Order not found' } }
          : { status: 409, body: { error: 'The exception is no longer open' } };
      }
      applied = res.applied;
      return { status: 200, body: { ok: true, exceptionId: res.applied.exceptionId, kind: res.applied.kind } };
    },
  );

  if (claimed.status !== 200) {
    return {
      status: claimed.status === 404 ? 404 : 409,
      error: String(claimed.body.error ?? 'Conflict'),
    };
  }
  const record = await deps.getRecord(orgId, shipmentId);
  if (!record) return { status: 404, error: 'Package not found' };
  return { status: 200, result: { ok: true, idempotent: claimed.cached, record }, applied };
}

// ─── Default (database) collaborators ────────────────────────────────────────

async function loadTarget(orgId: OrgId, shipmentId: number): Promise<ResolveTarget | null> {
  const stn = await readVisibleShipment(orgId, shipmentId);
  if (!stn) return null;
  const exceptions = await withTenantTransaction(orgId, (client) =>
    client.query<ShipmentExceptionRow>(SHIPMENT_EXCEPTIONS_SQL, [
      orgId,
      shipmentId,
      orderTrackingMatchKeys(stn.tracking_number_raw).key18,
    ]),
  );
  const open = exceptions.rows.find((e) => e.status === 'open');
  return { tracking: stn.tracking_number_raw, openExceptionId: open ? Number(open.id) : null };
}

interface LockedException {
  id: number;
  status: string;
  shipment_id: number | string | null;
  notes: string | null;
}

type TxClient = Pick<PoolClient, 'query'>;

/** node-pg returns bigint ids as strings; audit payloads carry numbers. */
function toId(value: number | string | null): number | null {
  return value == null ? null : Number(value);
}

/** The link write, inside the caller's tenant transaction (GUC already set). */
export async function linkOrderInTx(client: TxClient, orgId: OrgId, input: LinkOrderInput): Promise<ApplyResult> {
  const ex = (
    await client.query<LockedException>(
      `SELECT id, status, shipment_id, notes FROM orders_exceptions
        WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [input.exceptionId, orgId],
    )
  ).rows[0];
  if (!ex || ex.status !== 'open') return { ok: false, code: 'not_open' };

  const order = (
    await client.query<{ id: number; order_id: string | null; shipment_id: number | string | null; status: string | null }>(
      `SELECT id, order_id, shipment_id, status FROM orders
        WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [input.orderRowId, orgId],
    )
  ).rows[0];
  if (!order) return { ok: false, code: 'order_not_found' };

  const primaryLink = await client.query(
    `SELECT 1 FROM shipment_links
      WHERE organization_id = $1 AND owner_type = 'ORDER' AND owner_id = $2 AND is_primary
      LIMIT 1`,
    [orgId, order.id],
  );
  const orderShipmentId = order.shipment_id == null ? null : Number(order.shipment_id);
  const makePrimary =
    orderShipmentId === input.shipmentId || (orderShipmentId == null && primaryLink.rows.length === 0);
  const linkRole = makePrimary ? 'ORDER_PRIMARY' : 'ORDER_SPLIT';

  const link = await linkShipment(
    orgId,
    {
      ownerType: 'ORDER',
      ownerId: Number(order.id),
      shipmentId: input.shipmentId,
      direction: 'OUTBOUND',
      isPrimary: makePrimary,
      role: linkRole,
      source: 'shipment-exception-resolve',
      linkedBy: input.staffId,
      metadata: { orders_exception_id: input.exceptionId, client_event_id: input.clientEventId },
    },
    client,
  );
  if (makePrimary && orderShipmentId == null) {
    await client.query(
      `UPDATE orders SET shipment_id = $3 WHERE id = $1 AND organization_id = $2 AND shipment_id IS NULL`,
      [order.id, orgId, input.shipmentId],
    );
  }

  // Same rule as syncOrderExceptionsToOrders: a completed ORDERS pack of the
  // package makes the order `packed` — but never walk a shipped order back.
  const statusRes = await client.query<{ status: string | null }>(
    `UPDATE orders o
        SET status = 'packed'
      WHERE o.id = $1
        AND o.organization_id = $2
        AND COALESCE(o.status, '') NOT IN ('packed', 'shipped')
        AND EXISTS (
          SELECT 1 FROM packer_logs pl
           WHERE pl.shipment_id = $3
             AND pl.organization_id = $2
             AND pl.tracking_type = 'ORDERS'
             AND pl.completion_state = 'COMPLETED'
        )
      RETURNING o.status`,
    [order.id, orgId, input.shipmentId],
  );

  await client.query(
    `UPDATE orders_exceptions
        SET status = 'resolved', shipment_id = COALESCE(shipment_id, $3), updated_at = NOW()
      WHERE id = $1 AND organization_id = $2`,
    [ex.id, orgId, input.shipmentId],
  );

  // The Shipped feed reads the order off the PACK enrichment projection;
  // recompute this package's scans so the row paints the order now.
  const salIds = await client.query<{ id: number }>(
    `SELECT id FROM station_activity_logs
      WHERE organization_id = $1 AND shipment_id = $2 AND station = 'PACK'`,
    [orgId, input.shipmentId],
  );
  await computePackerLogEnrichment(
    client,
    salIds.rows.map((r) => Number(r.id)),
  );

  return {
    ok: true,
    applied: {
      exceptionId: Number(ex.id),
      kind: 'link-order',
      orderRowId: Number(order.id),
      orderRef: order.order_id,
      linkRole,
      before: {
        status: ex.status,
        shipment_id: toId(ex.shipment_id),
        order_status: order.status,
        order_shipment_id: orderShipmentId,
      },
      after: {
        status: 'resolved',
        shipment_id: toId(ex.shipment_id) ?? input.shipmentId,
        order_row_id: Number(order.id),
        order_ref: order.order_id,
        order_status: statusRes.rows[0]?.status ?? order.status,
        order_shipment_id: orderShipmentId ?? (makePrimary ? input.shipmentId : null),
        link_role: linkRole,
        box_seq: link.box_seq,
      },
    },
  };
}

/** The close write, inside the caller's tenant transaction (GUC already set). */
export async function closeExceptionInTx(client: TxClient, orgId: OrgId, input: CloseInput): Promise<ApplyResult> {
  const ex = (
    await client.query<LockedException>(
      `SELECT id, status, shipment_id, notes FROM orders_exceptions
        WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [input.exceptionId, orgId],
    )
  ).rows[0];
  if (!ex || ex.status !== 'open') return { ok: false, code: 'not_open' };

  const updated = await client.query<{ notes: string | null }>(
    `UPDATE orders_exceptions
        SET status = 'resolved',
            shipment_id = COALESCE(shipment_id, $3),
            notes = CONCAT_WS(E'\\n', NULLIF(BTRIM(COALESCE(notes, '')), ''), $4::text),
            updated_at = NOW()
      WHERE id = $1 AND organization_id = $2
      RETURNING notes`,
    [ex.id, orgId, input.shipmentId, `Closed: ${input.reason}`],
  );

  return {
    ok: true,
    applied: {
      exceptionId: Number(ex.id),
      kind: 'close',
      orderRowId: null,
      orderRef: null,
      linkRole: null,
      before: { status: ex.status, notes: ex.notes, shipment_id: toId(ex.shipment_id) },
      after: {
        status: 'resolved',
        notes: updated.rows[0]?.notes ?? null,
        shipment_id: toId(ex.shipment_id) ?? input.shipmentId,
        reason: input.reason,
      },
    },
  };
}

const defaultDeps: ResolveShipmentExceptionDeps = {
  claim: ({ orgId, staffId, key }, produce) =>
    withIdempotencyClaim(pool, { orgId, staffId, idempotencyKey: key, route: RESOLVE_SHIPMENT_EXCEPTION_ROUTE }, produce),
  loadTarget,
  linkOrder: (orgId, input) => withTenantTransaction(orgId, (client) => linkOrderInTx(client, orgId, input)),
  close: (orgId, input) => withTenantTransaction(orgId, (client) => closeExceptionInTx(client, orgId, input)),
  getRecord: getShipmentRecord,
};
