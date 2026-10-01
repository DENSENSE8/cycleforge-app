/** Dock scan-out — "this packed carton physically left the building". */

import type { NextRequest } from 'next/server';
import pool from '@/lib/db';
import type { AnonymousAuthContext, AuthContext } from '@/lib/auth/auth-context';
import { tenantQuery } from '@/lib/tenancy/db';
import { resolveShipmentId } from '@/lib/shipping/resolve';
import { createStationActivityLog } from '@/lib/station-activity';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY, type RecordAuditArgs } from '@/lib/audit-logs';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { extractCanonicalTracking } from '@/lib/tracking-format';
import { applyOrderTrackingOps } from '@/lib/neon/orders-tracking-queries';
import { mirrorLegacyPackToAllocations } from '@/lib/inventory/sync-legacy-pack';
import { productImageUrl } from '@/lib/photos/product-image-url';
import { publishOrderChanged } from '@/lib/realtime/publish';
import type { OrgId } from '@/lib/tenancy/constants';

/** Reasons the dock must refuse a physical handoff. */
export type ScanOutBlockReason = 'canceled' | 'cancelled' | 'not_packed';

/** Order states that must never leave the building. */
const BLOCKED_ORDER_STATUSES: Readonly<Record<string, true>> = { canceled: true, cancelled: true };

/** The normalized blocking status, or null when status itself permits shipping. */
export function blockedOrderStatus(status: unknown): Exclude<ScanOutBlockReason, 'not_packed'> | null {
  const normalized = String(status ?? '').trim().toLowerCase();
  return BLOCKED_ORDER_STATUSES[normalized] === true
    ? normalized as Exclude<ScanOutBlockReason, 'not_packed'>
    : null;
}

/** One decision for the API POST and read-only identification face. */
export function scanOutBlockReason(status: unknown, isPacked: boolean): ScanOutBlockReason | null {
  return blockedOrderStatus(status) ?? (isPacked ? null : 'not_packed');
}

export function scanOutBlockedMessage(reason: ScanOutBlockReason): string {
  return reason === 'not_packed'
    ? 'Order is not packed — pack it before scan-out.'
    : 'Order is cancelled — do not ship. Pull this package.';
}

/**
 * Who pressed it. `dock` = the gun; `desk-selection` = the Scan out verb on a
 * desk selection; `bulk` = an operator-authorized backlog clear run as a script.
 */
export type ScanOutOrigin = 'dock' | 'desk-selection' | 'phone' | 'bulk';

const ORIGIN_NOTES: Record<ScanOutOrigin, string> = {
  dock: 'Scanned out at dock',
  'desk-selection': 'Marked as shipped from selection',
  phone: 'Scanned out on phone',
  bulk: 'Bulk scanned out (operator-authorized backlog clear)',
};

const ORIGIN_AUDIT_SOURCE: Record<ScanOutOrigin, string> = {
  dock: 'api.shipped.scan-out',
  'desk-selection': 'api.shipped.scan-out',
  phone: 'api.shipped.scan-out',
  bulk: 'scripts.scan-out-packed-orders',
};

/** The carton a scan resolved to — the toast / running-list context. */
export interface ScanOutCarton {
  shipmentId: number;
  tracking: string;
  receivingId: number | null;
  orderRowId: number | null;
  orderId: string | null;
  productTitle: string | null;
  sku: string | null;
  itemNumber: string | null;
  condition: string | null;
  quantity: number | null;
  accountSource: string | null;
  imageUrl: string | null;
  orderStatus: string | null;
}

/** Carton context plus the carrier facts the preconditions read. */
export interface ScanOutContext {
  carton: ScanOutCarton;
  latestStatusCategory: string | null;
  isTerminal: boolean;
  /** A completed ORDERS packer_log exists for this shipment. */
  isPacked: boolean;
}

export type ScanOutResult =
  | { kind: 'unmatched' }
  | { kind: 'blocked'; blockReason: ScanOutBlockReason; carton: ScanOutCarton }
  | { kind: 'duplicate'; shipConfirmedAt: string; carton: ScanOutCarton }
  | { kind: 'confirmed'; activityId: number | null; carton: ScanOutCarton };

export interface ScanOutInput {
  organizationId: string;
  /** The label as scanned (raw gun read or stored tracking number). */
  scan: string;
  /** Staff stamped on the SHIP_CONFIRM event. */
  actorStaffId: number | null;
  /** Already-validated backdate (PST-normalized), or null for server now. */
  createdAt: string | null;
  origin: ScanOutOrigin;
  /** Resolver intent correlation and canonical phone surface metadata. */
  correlation?: {
    clientEventId?: string | null;
    mobileScanEventId?: number | null;
    surface?: string | null;
  };
  /**
   * Request attribution for the audit row. Routes pass their auth ctx + req;
   * scripts omit it and the audit falls back to `actorStaffId` + org override.
   */
  auditRequest?: ScanOutAuditRequest;
}

/** The request identity an audit row is attributed to. */
export interface ScanOutAuditRequest {
  ctx: AuthContext | AnonymousAuthContext | null;
  req: Pick<NextRequest, 'headers'> | null;
}

export interface ScanOutDeps {
  resolveShipment: (scan: string, organizationId: string) => Promise<number | null>;
  loadContext: (organizationId: string, shipmentId: number, scan: string) => Promise<ScanOutContext>;
  findShipConfirm: (organizationId: string, shipmentId: number) => Promise<{ createdAt: string } | null>;
  createShipConfirm: (params: {
    organizationId: string;
    staffId: number | null;
    shipmentId: number;
    scanRef: string;
    notes: string;
    metadata: Record<string, unknown>;
    createdAt: string | null;
  }) => Promise<number | null>;
  recordAudit: (
    ctx: ScanOutAuditRequest['ctx'],
    req: ScanOutAuditRequest['req'],
    args: RecordAuditArgs,
  ) => Promise<unknown>;
  mirrorAllocations: (
    organizationId: string,
    input: { packerLogId: number; shipmentId: number; actorStaffId: number | null },
  ) => Promise<unknown>;
  invalidateCaches: (organizationId: string) => Promise<unknown>;
  publishOrderChanged: (organizationId: string, orderRowId: number) => Promise<unknown>;
}


export async function scanOutLabel(
  input: ScanOutInput,
  deps: ScanOutDeps = defaultScanOutDeps,
): Promise<ScanOutResult> {
  const shipmentId = await deps.resolveShipment(input.scan, input.organizationId);
  if (shipmentId == null) return { kind: 'unmatched' };
  return scanOutResolvedShipment(input, shipmentId, deps);
}

/**
 * Bulk callers already hold the canonical shipment id. Do not re-resolve its
 * stored label: legacy routed/GS1 values can canonicalize to a different
 * registry row and would stamp the wrong carton.
 */
export async function scanOutKnownShipment(
  input: ScanOutInput & { shipmentId: number },
  deps: ScanOutDeps = defaultScanOutDeps,
): Promise<ScanOutResult> {
  const shipmentId = Number(input.shipmentId);
  if (!Number.isSafeInteger(shipmentId) || shipmentId <= 0) {
    throw new Error(`Invalid shipment id: ${input.shipmentId}`);
  }
  return scanOutResolvedShipment(input, shipmentId, deps);
}

async function scanOutResolvedShipment(
  input: ScanOutInput,
  shipmentId: number,
  deps: ScanOutDeps,
): Promise<ScanOutResult> {
  const { organizationId, scan, origin } = input;
  const context = await deps.loadContext(organizationId, shipmentId, scan);
  const { carton } = context;

  /* Preconditions: cancellation and an absent completed pack both fail closed. */
  const blockReason = scanOutBlockReason(carton.orderStatus, context.isPacked);
  if (blockReason) return { kind: 'blocked', blockReason, carton };


  // Idempotency: a package leaves once. Return the existing event if present.
  const existing = await deps.findShipConfirm(organizationId, shipmentId);
  if (existing) return { kind: 'duplicate', shipConfirmedAt: existing.createdAt, carton };

  const activityId = await deps.createShipConfirm({
    organizationId,
    staffId: input.actorStaffId,
    shipmentId,
    scanRef: scan,
    notes: ORIGIN_NOTES[origin],
    metadata: {
      source: origin === 'bulk' ? 'bulk-scan-out' : 'shipped-scan-out',
      ...(origin === 'desk-selection' ? { deskSelection: true } : null),
      ...(origin === 'phone'
        ? {
            origin: 'phone',
            surface: input.correlation?.surface ?? '/m/id/scan-out',
            client_event_id: input.correlation?.clientEventId ?? null,
            ...(Number.isSafeInteger(Number(input.correlation?.mobileScanEventId))
              && Number(input.correlation?.mobileScanEventId) > 0
              ? { mobile_scan_event_id: Number(input.correlation?.mobileScanEventId) }
              : null),
            order_row_id: carton.orderRowId,
            order_id: carton.orderId,
            subject_entity_type: carton.orderRowId != null ? 'order' : 'shipment',
            subject_id: String(carton.orderRowId ?? carton.shipmentId),
            subject_identifier: carton.orderId ?? carton.tracking,
          }
        : null),
    },
    createdAt: input.createdAt,
  });

  // Audit: the package physically left the warehouse (mirrors packing-logs PACK_COMPLETED).
  await deps.recordAudit(input.auditRequest?.ctx ?? null, input.auditRequest?.req ?? null, {
    source: ORIGIN_AUDIT_SOURCE[origin],
    action: AUDIT_ACTION.SHIP_CONFIRM_SCAN,
    entityType: AUDIT_ENTITY.SHIPMENT,
    entityId: String(shipmentId),
    stationActivityLogId: activityId,
    ...(origin === 'bulk' ? { method: 'system' as const } : null),
    actorStaffIdOverride: input.actorStaffId,
    organizationIdOverride: organizationId,
    extra: { tracking: carton.tracking, order_id: carton.orderId },
  });

  // Close the ship gap for units that reached the dock without /api/pack/ship:
  // best-effort mirror open allocations → SHIPPED (idempotent via transition()).
  // Never fail the scan-out write if the mirror no-ops or errors.
  if (activityId != null) {
    await deps
      .mirrorAllocations(organizationId, {
        packerLogId: activityId,
        shipmentId,
        actorStaffId: input.actorStaffId,
      })
      .catch(() => null);
  }

  // Bust the shipped/packer-logs cache so the two tables reflect the move.
  await deps.invalidateCaches(organizationId).catch(() => {});
  if (carton.orderRowId != null) {
    await deps.publishOrderChanged(organizationId, carton.orderRowId).catch(() => {});
  }

  return { kind: 'confirmed', activityId, carton };
}

// ── Real collaborators ─────────────────────────────────────────────────────

interface TrackingRow {
  id: number;
  shipment_id: number | null;
  shipping_tracking_number: string | null;
}

/**
 * Org-scoped last-8 prefilter on a tracking column, then exact canonical-match
 * in JS (`extractCanonicalTracking` unwraps FedEx GS1 + strips USPS routing /
 * collapses repeats — awkward to replicate in SQL). Returns the matching row.
 */
async function findByTracking(
  table: 'orders' | 'orders_exceptions',
  organizationId: string,
  norm: string,
): Promise<TrackingRow | null> {
  const last8 = norm.slice(-8).toUpperCase();
  const rows = await tenantQuery<TrackingRow>(
    organizationId,
    `SELECT id, shipment_id, shipping_tracking_number
         FROM ${table}
        WHERE organization_id = $1
          AND shipping_tracking_number IS NOT NULL
          AND right(regexp_replace(upper(shipping_tracking_number), '[^A-Z0-9]', '', 'g'), 8) = $2
        ORDER BY id DESC
        LIMIT 25`,
    [organizationId, last8],
  )
    .then((r) => r.rows)
    .catch(() => [] as TrackingRow[]);
  return (
    rows.find(
      (row) => extractCanonicalTracking(String(row.shipping_tracking_number ?? '')) === norm,
    ) ?? null
  );
}

/** Fallback resolution when the carrier shipment registry has no row for the scanned label. */
async function resolveShipmentViaOrderOrException(
  raw: string,
  organizationId: string,
): Promise<number | null> {
  // FedEx GS1 SoT — unwrap 96… gun reads before last-8 / exact compare.
  const norm = extractCanonicalTracking(raw);
  if (!norm) return null;

  // 1. Real orders take precedence over the exception hold-bucket.
  const order = await findByTracking('orders', organizationId, norm);
  if (order) {
    if (order.shipment_id != null) return Number(order.shipment_id);
    try {
      const result = await applyOrderTrackingOps({
        orderIds: [Number(order.id)],
        setTrackingNumbers: [String(order.shipping_tracking_number)],
        organizationId: organizationId as OrgId,
      });
      if (result.primaryShipmentId != null) return result.primaryShipmentId;
    } catch {
      // fall through to the exception bucket
    }
  }

  // 2. Unmatched-scan hold bucket.
  const exception = await findByTracking('orders_exceptions', organizationId, norm);
  if (exception?.shipment_id != null) return Number(exception.shipment_id);

  return null;
}

async function loadScanOutContext(
  organizationId: string,
  shipmentId: number,
  scan: string,
): Promise<ScanOutContext> {
  // Light context for the toast / running list (best-effort).
  const row = await tenantQuery(
    organizationId,
    `SELECT stn.tracking_number_raw    AS tracking,
              stn.latest_status_category AS latest_status_category,
              stn.is_terminal            AS is_terminal,
              o.id                    AS order_row_id,
              o.order_id              AS order_id,
              o.product_title         AS product_title,
              o.sku                   AS sku,
              o.item_number           AS item_number,
              o.condition             AS condition,
              o.quantity              AS quantity,
              o.account_source        AS account_source,
              o.status                AS order_status,
              EXISTS (
                SELECT 1
                  FROM packer_logs pl
                 WHERE pl.organization_id = stn.organization_id
                   AND pl.shipment_id = stn.id
                   AND pl.tracking_type = 'ORDERS'
                   AND pl.completion_state = 'COMPLETED'
              )                       AS is_packed,
              sc.image_url            AS catalog_image_url,
              zi.zoho_item_id         AS zoho_item_id,
              zi.image_document_id    AS zoho_image_document_id,
              (SELECT r.id
                 FROM receiving_carton r
                WHERE r.shipment_id = stn.id
                  AND r.organization_id = stn.organization_id
                ORDER BY r.id DESC
                LIMIT 1)              AS receiving_id
       FROM shipping_tracking_numbers stn
       LEFT JOIN orders o ON o.shipment_id = stn.id
       -- Same catalog join /api/orders uses for catalog_image_url: the photo
       -- lives on sku_catalog, never on orders.
       LEFT JOIN sku_catalog sc ON sc.id = o.sku_catalog_id
       -- Zoho is the SoT for a unit's photo (operator 2026-09-05). The items
       -- table is the local Zoho mirror, keyed by SKU.
       -- NB: no backticks in SQL comments — this is a JS template literal.
       LEFT JOIN items zi
              ON zi.sku = o.sku
             AND zi.organization_id = o.organization_id
       WHERE stn.id = $1
       ORDER BY o.id DESC
       LIMIT 1`,
    [shipmentId],
  )
    .then((r) => (r.rows[0] ?? null) as Record<string, unknown> | null)
    .catch(() => null);

  return {
    carton: {
      shipmentId,
      tracking: (row?.tracking as string | null) ?? scan,
      receivingId: row?.receiving_id != null ? Number(row.receiving_id) : null,
      orderRowId: row?.order_row_id != null ? Number(row.order_row_id) : null,
      orderId: (row?.order_id as string | null) ?? null,
      productTitle: (row?.product_title as string | null) ?? null,
      sku: (row?.sku as string | null) ?? null,
      itemNumber: (row?.item_number as string | null) ?? null,
      condition: (row?.condition as string | null) ?? null,
      quantity: row?.quantity != null ? Number(row.quantity) : null,
      accountSource: (row?.account_source as string | null) ?? null,
      imageUrl: productImageUrl({
        zohoItemId: row?.zoho_item_id as string | null | undefined,
        zohoImageDocumentId: row?.zoho_image_document_id as string | null | undefined,
        catalogImageUrl: row?.catalog_image_url as string | null | undefined,
      }),
      orderStatus: (row?.order_status as string | null) ?? null,
    },
    latestStatusCategory: (row?.latest_status_category as string | null) ?? null,
    isTerminal: row?.is_terminal === true,
    isPacked: row?.is_packed === true,
  };
}

const defaultScanOutDeps: ScanOutDeps = {
  resolveShipment: async (scan, organizationId) => {
    // Registry first (registers/syncs a recognized carrier tracking the same
    // way the pack station does), then the orders / exception fallback.
    const id =
      (await resolveShipmentId(scan, organizationId)).shipmentId ??
      (await resolveShipmentViaOrderOrException(scan, organizationId));
    // pg hands bigint ids back as strings despite the declared `number`.
    return id == null ? null : Number(id);
  },
  loadContext: loadScanOutContext,
  findShipConfirm: async (organizationId, shipmentId) => {
    const existing = await tenantQuery(
      organizationId,
      `SELECT to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at
       FROM station_activity_logs
       WHERE activity_type = 'SHIP_CONFIRM' AND shipment_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [shipmentId],
    );
    const row = existing.rows[0];
    return row ? { createdAt: String(row.created_at) } : null;
  },
  createShipConfirm: (params) =>
    createStationActivityLog(pool, {
      ...params,
      station: 'OUTBOUND',
      activityType: 'SHIP_CONFIRM',
    }),
  recordAudit: (ctx, req, args) => recordAudit(pool, ctx, req, args),
  mirrorAllocations: (organizationId, input) =>
    mirrorLegacyPackToAllocations(input, organizationId as OrgId),
  invalidateCaches: (organizationId) =>
    invalidateCacheTags(organizationId, ['packing-logs', 'shipped']),
  publishOrderChanged: (organizationId, orderRowId) =>
    publishOrderChanged({
      organizationId,
      orderIds: [orderRowId],
      source: 'shipping.scan-out',
    }),
};
