/** returned-serial-link.ts ──────────────────────────────────────────────────────────────────── Close the shipped↔returned loop ON THE… */

import type { PoolClient } from 'pg';
import { withTenantTransaction, tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { resolvePriorOutbound, normalizeSerial, upsertSerialUnit } from '@/lib/neon/serial-units-queries';
import { attachSerialToLine } from '@/lib/receiving/serial-attach';
import { transitionReceivingLine } from '@/lib/receiving/state-machine';
import { recordInventoryEvent } from '@/lib/inventory/events';
import { upsertReceivingLineReturn } from '@/lib/receiving/facts/narrow';
import {
  upsertReceivingTriage,
  upsertReceivingUnbox,
} from '@/lib/receiving/streets/carton-street-write';
import { resolveReceivingExceptionsByReceivingId } from '@/lib/tracking-exceptions';
import { recordReceivingException } from '@/lib/receiving/exceptions';
import { getExternalUrlByItemNumber, getPlatformKeyByItemNumber } from '@/utils/external-item-url';
import { columnsToClassification, classificationToColumns } from '@/lib/receiving/intake-classification';
import { tapWorkflow } from '@/lib/workflow/tap';
import { emitEntitySignalSafe } from '@/lib/surfaces/record-entity-signal';
import { returnOrderLineFill } from '@/lib/receiving/return-order-imported';

// ─── Shared types ────────────────────────────────────────────────────────────

export interface ReturnedSerialMatchedOrder {
  order_pk: number;
  order_id: string | null;
  item_number: string | null;
  account_source: string | null;
  product_title: string | null;
  sku: string | null;
  condition: string | null;
  tracking_number: string | null;
  /** Listing link built from item_number (shipped-details builder). */
  listing_url: string | null;
  via: 'allocation' | 'tsn' | 'order_number';
}

interface CartonState {
  source: string | null;
  zoho_purchaseorder_id: string | null;
  source_platform: string | null;
}

/** The originating order, in the minimal shape persistReturnLinkage needs. */
interface ReturnLinkageOrder {
  orderPk: number;
  orderId: string;
  itemNumber: string | null;
  accountSource: string | null;
  productTitle?: string | null;
  sku?: string | null;
}

interface ReturnLinkagePersisted {
  /** False when the carton is a real Zoho PO (never reclassified). */
  eligible: boolean;
  promotedToFound: boolean;
  listingUrl: string | null;
  returnPlatform: string | null;
  sourcePlatform: string | null;
  productTitle?: string | null;
  sku?: string | null;
  /** The line's workflow_status AFTER the guarded advance (null if not eligible). */
  workflowStatus: string | null;
}

/** The exact receiving-line row patch a return import / returned-serial scan produces. */
export interface ReturnLinkageLinePatch {
  id: number;
  receiving_type: 'RETURN';
  carton_intake_type: 'RETURN';
  receiving_source: 'zoho_po';
  zoho_purchaseorder_number: string;
  source_order_id?: string;
  item_name?: string;
  sku?: string | null;
  source_platform?: string | null;
  receiving_listing_url?: string | null;
  workflow_status?: string | null;
}

/** Build the optimistic line patch from a persisted linkage. */
function buildReturnLinkagePatch(
  receivingLineId: number,
  orderId: string,
  persisted: ReturnLinkagePersisted,
): ReturnLinkageLinePatch | null {
  if (!persisted.eligible) return null;
  const fill = returnOrderLineFill({
    orderId,
    productTitle: persisted.productTitle,
    sku: persisted.sku,
    platform: persisted.sourcePlatform,
  });
  const patch: ReturnLinkageLinePatch = {
    id: receivingLineId,
    receiving_type: 'RETURN',
    carton_intake_type: 'RETURN',
    receiving_source: 'zoho_po',
    zoho_purchaseorder_number: fill.zoho_purchaseorder_number,
    source_order_id: fill.source_order_id,
  };
  if (fill.item_name) patch.item_name = fill.item_name;
  if (fill.sku) patch.sku = fill.sku;
  if (fill.source_platform) patch.source_platform = fill.source_platform;
  if (persisted.sourcePlatform) patch.source_platform = persisted.sourcePlatform;
  if (persisted.listingUrl) patch.receiving_listing_url = persisted.listingUrl;
  if (persisted.workflowStatus) patch.workflow_status = persisted.workflowStatus;
  return patch;
}

type PersistLinkageDeps = {
  upsertReceivingLineReturn: typeof upsertReceivingLineReturn;
  resolveReceivingExceptionsByReceivingId: (receivingId: number, client: PoolClient) => Promise<number>;
  listingUrlForItemNumber: (itemNumber: string | null | undefined) => string | null;
  /** Status chokepoint (Step D) — the only writer of workflow_status. */
  transitionLine: typeof transitionReceivingLine;
  /** Carton unbox street writer (Wave-3 inversion) — the unboxed stamp lives
   *  on receiving_unbox now, not the spine. Injected for DB-free tests. */
  upsertUnbox: typeof upsertReceivingUnbox;
};

// ─── Platform mapping ──────────────────────────────────────────────────────────

const KNOWN_PLATFORMS = new Set(['fba', 'amazon', 'ebay', 'walmart']);

/** Collapse a free-form channel string (orders.account_source, or an item-number-derived platform key) to one of the known marketplaces so… */
function collapsePlatform(raw: string | null | undefined): string | null {
  const s = (raw || '').toLowerCase().trim();
  if (!s) return null;
  if (s.includes('fba')) return 'fba';
  if (s.includes('amazon')) return 'amazon';
  if (s.includes('walmart')) return 'walmart';
  if (s.includes('ebay')) return 'ebay';
  return s;
}

/** Resolve an order's channel → { returnPlatform, sourcePlatform } via the SoT. */
function resolveReturnPlatformCols(
  accountSource: string | null,
  itemNumber: string | null,
): { returnPlatform: string | null; sourcePlatform: string | null } {
  const platform = collapsePlatform(accountSource) ?? collapsePlatform(getPlatformKeyByItemNumber(itemNumber));
  if (platform && KNOWN_PLATFORMS.has(platform)) {
    const cols = classificationToColumns(columnsToClassification({ is_return: true, source_platform: platform }));
    return { returnPlatform: cols.return_platform, sourcePlatform: cols.source_platform ?? platform };
  }
  return { returnPlatform: null, sourcePlatform: platform };
}

// ─── Shared persistence ────────────────────────────────────────────────────────

/** Persist the carton/line return linkage for a resolved order. */
async function persistReturnLinkage(
  client: PoolClient,
  params: {
    receivingLineId: number;
    receivingId: number | null;
    order: ReturnLinkageOrder;
    reason: string;
    actorStaffId?: number | null;
  },
  orgId: OrgId,
  deps: PersistLinkageDeps,
): Promise<ReturnLinkagePersisted> {
  const { receivingLineId, receivingId, order, reason } = params;
  const { returnPlatform, sourcePlatform } = resolveReturnPlatformCols(order.accountSource, order.itemNumber);
  const listingUrl = deps.listingUrlForItemNumber(order.itemNumber);

  // Carton gate — never reclassify a real Zoho PO.
  let carton: CartonState | undefined;
  if (receivingId != null) {
    const cr = await client.query<CartonState>(
      `SELECT source, zoho_purchaseorder_id, source_platform
         FROM receiving_carton WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [receivingId, orgId],
    );
    carton = cr.rows[0];
  }
  const isRealPo = !!carton && carton.source === 'zoho_po' && !!carton.zoho_purchaseorder_id;
  const cartonEligible = receivingId != null && !!carton && !isRealPo;

  // Per-line source order linkage (lights up the existing RETURN UI).
  const lineUpd = await client.query<{ workflow_status: string | null }>(
    `UPDATE receiving_line
        SET source_order_id   = $2,
            source_system     = COALESCE(source_system, $3),
            receiving_type    = 'RETURN',
            listing_url       = COALESCE(listing_url, $4),
            listing_reference = COALESCE(listing_reference, $5),
            item_name         = COALESCE($7, item_name),
            sku               = COALESCE($8, sku),
            source_platform   = COALESCE(source_platform, $3),
            updated_at        = NOW()
      WHERE id = $1 AND organization_id = $6
      RETURNING workflow_status::text AS workflow_status`,
    [
      receivingLineId,
      order.orderId,
      sourcePlatform,
      listingUrl,
      order.itemNumber,
      orgId,
      order.productTitle?.trim() || null,
      order.sku?.trim() || null,
    ],
  );
  const currentStatus = lineUpd.rows[0]?.workflow_status ?? null;

  // A return is RECEIVED by the act of processing it (there is no Zoho-PO receive step), so advance a pre-receive line → UNBOXED (the enum's…
  let workflowStatus = currentStatus;
  if (currentStatus === 'EXPECTED' || currentStatus === 'ARRIVED' || currentStatus === 'MATCHED') {
    const tr = await deps.transitionLine(
      {
        receivingLineId,
        to: 'UNBOXED',
        actorStaffId: params.actorStaffId ?? null,
        skipEvent: true,
      },
      client,
      orgId,
    );
    if (tr.ok) {
      workflowStatus = tr.to;
    } else {
      console.warn('persistReturnLinkage: UNBOXED advance declined (kept current status)', tr);
    }
  }

  // Typed 1:1 return fact, on the transaction client so it commits atomically.
  const txDeps = {
    query: ((_org: OrgId, sql: string, p?: unknown[]) => client.query(sql, p)) as typeof tenantQuery,
  };
  await deps.upsertReceivingLineReturn(
    orgId,
    receivingLineId,
    { returnPlatform, returnReason: reason, sourceOrderId: order.orderId },
    txDeps,
  );

  if (!cartonEligible) {
    return { eligible: true, promotedToFound: false, listingUrl, returnPlatform, sourcePlatform, productTitle: order.productTitle ?? null, sku: order.sku ?? null, workflowStatus };
  }

  // Promote the carton:
  const promo = await client.query(
    `UPDATE receiving_carton
        SET is_return                 = true,
            return_platform           = COALESCE(return_platform, $2),
            source_platform           = COALESCE(source_platform, $3),
            intake_type               = 'RETURN',
            zoho_purchaseorder_number = COALESCE(zoho_purchaseorder_number, $4),
            source                    = CASE WHEN source = 'unmatched' THEN 'zoho_po' ELSE source END,
            updated_at                = NOW()
      WHERE id = $1 AND organization_id = $5`,
    [receivingId, returnPlatform, sourcePlatform, order.orderId, orgId],
  );
  const promotedToFound = (promo.rowCount ?? 0) > 0;

  // A processed return is unboxed/received, not just scanned.
  await deps.upsertUnbox(client, orgId, receivingId, {
    unboxedAt: 'now',
    deriveIntakePath: true,
  });

  // Clear the open NO_PO / carrier-mismatch exception → leaves the Unfound queue.
  await deps.resolveReceivingExceptionsByReceivingId(receivingId, client);

  return { eligible: true, promotedToFound, listingUrl, returnPlatform, sourcePlatform, productTitle: order.productTitle ?? null, sku: order.sku ?? null, workflowStatus };
}

// ─── Entry 1: serial scan ───────────────────────────────────────────────────────

interface ReturnedSerialLinkInput {
  serialUnitId: number;
  normalizedSerial: string;
  receivingLineId: number;
  receivingId: number | null;
  staffId?: number | null;
  /** Threaded for idempotent inventory_events on retry. */
  clientEventId?: string | null;
  /** The unit's status BEFORE the receiving attach flipped it (for the journey event). */
  priorStatus?: string | null;
  /** Stamped on the allocation + the RETURNED event. */
  reason?: string | null;
  sku?: string | null;
}

interface ReturnedSerialLinkResult {
  /** True when a prior outbound order was resolved AND its linkage persisted. */
  linked: boolean;
  /** True when an open SHIPPED allocation was flipped → RETURNED. */
  allocationReturned: boolean;
  /** True when an unfound carton was promoted off the Unfound queue. */
  promotedToFound: boolean;
  matchedOrder: ReturnedSerialMatchedOrder | null;
  /** Optimistic receiving-line row patch (type/listing/source/order#/status) the client applies via `dispatchLineUpdated` so the workspace… */
  linePatch: ReturnLinkageLinePatch | null;
}

export interface ReturnedSerialLinkDeps extends PersistLinkageDeps {
  runTransaction: <T>(orgId: OrgId, cb: (client: PoolClient) => Promise<T>) => Promise<T>;
  resolvePriorOutbound: typeof resolvePriorOutbound;
  recordInventoryEvent: typeof recordInventoryEvent;
  /** Studio-node tap (Tap 1 — return detected, disposition unknown). Injected
   *  for testability; fire-and-forget by its own contract, never throws. */
  tap: typeof tapWorkflow;
  /** Optional "why" signal emitter (plan §2.3 emitter #1) — fire-and-forget
   *  by its own contract, never throws; defaults to the real impl. */
  emitSignal?: typeof emitEntitySignalSafe;
  /** Optional line-level exception recorder — used to log a RETURN_NO_ORDER
   *  investigate item when a physical return matches no sales order. Injected
   *  for testability; best-effort at the call site. Defaults to the real impl. */
  recordException?: typeof recordReceivingException;
}

const defaultDeps: ReturnedSerialLinkDeps = {
  runTransaction: withTenantTransaction,
  resolvePriorOutbound,
  upsertReceivingLineReturn,
  resolveReceivingExceptionsByReceivingId,
  recordInventoryEvent,
  listingUrlForItemNumber: getExternalUrlByItemNumber,
  transitionLine: transitionReceivingLine,
  upsertUnbox: upsertReceivingUnbox,
  tap: tapWorkflow,
  emitSignal: emitEntitySignalSafe,
  recordException: recordReceivingException,
};

/**
 * Resolve + persist the return linkage for a serial `attachSerialToLine` flagged
 * `is_return`. Safe to call unconditionally on a return scan: no-ops cleanly when
 * no prior order resolves.
 */
export async function linkReturnedSerial(
  input: ReturnedSerialLinkInput,
  orgId: OrgId,
  deps: ReturnedSerialLinkDeps = defaultDeps,
): Promise<ReturnedSerialLinkResult> {
  const reason = input.reason?.trim() || 'customer return (unbox scan)';

  const result = await deps.runTransaction(orgId, async (client) => {
    // 1. Reverse-link: resolve the order this serial last shipped on (BEFORE the
    //    allocation flip so it still sees the open SHIPPED row).
    const prior = await deps.resolvePriorOutbound(
      { id: input.serialUnitId, normalized_serial: input.normalizedSerial },
      { executor: client, organizationId: orgId },
      orgId,
    );

    // 2. Flip the open SHIPPED allocation → RETURNED (idempotent, ledger-free).
    const flip = await client.query(
      `UPDATE order_unit_allocations
          SET state = 'RETURNED', returned_at = NOW(), returned_reason = $2
        WHERE serial_unit_id = $1 AND state = 'SHIPPED'
          AND organization_id = $3`,
      [input.serialUnitId, reason, orgId],
    );
    const allocationReturned = (flip.rowCount ?? 0) > 0;

    // No prior order — still a return (unit was SHIPPED); flag an eligible carton
    // but nothing to import / promote. Guard skips a real Zoho-PO carton.
    if (!prior || !prior.orderId) {
      const knownReturn = input.priorStatus === 'SHIPPED';
      if (knownReturn && input.receivingId != null) {
        await client.query(
          `UPDATE receiving_carton SET is_return = true, updated_at = NOW()
            WHERE id = $1 AND organization_id = $2
              AND NOT (source = 'zoho_po' AND zoho_purchaseorder_id IS NOT NULL)`,
          [input.receivingId, orgId],
        );
      }
      return { linked: false, allocationReturned, promotedToFound: false, matchedOrder: null, linePatch: null };
    }

    // 3. Persist the carton/line linkage (shared with the order-number import).
    const persisted = await persistReturnLinkage(
      client,
      {
        receivingLineId: input.receivingLineId,
        receivingId: input.receivingId,
        order: {
          orderPk: prior.orderPk,
          orderId: prior.orderId,
          itemNumber: prior.itemNumber,
          accountSource: prior.accountSource,
          productTitle: prior.productTitle,
          sku: prior.sku,
        },
        reason,
        actorStaffId: input.staffId ?? null,
      },
      orgId,
      deps,
    );

    // 4. RETURNED lifecycle event so the unit's JOURNEY reads the return (the
    //    status was already flipped to RETURNED by the attach upsert; this only
    //    logs the transition, it does not write current_status).
    try {
      await deps.recordInventoryEvent(
        {
          event_type: 'RETURNED',
          actor_staff_id: input.staffId ?? null,
          station: 'RECEIVING',
          receiving_id: input.receivingId,
          receiving_line_id: input.receivingLineId,
          serial_unit_id: input.serialUnitId,
          sku: input.sku ?? prior.sku ?? null,
          prev_status: input.priorStatus ?? 'SHIPPED',
          next_status: 'RETURNED',
          client_event_id: input.clientEventId ? `${input.clientEventId}:return-link` : null,
          notes: `Return of order ${prior.orderId}`,
          payload: {
            return_link: true,
            order_id: prior.orderId,
            order_pk: prior.orderPk,
            matched_via: prior.via,
            allocation_returned: allocationReturned,
            item_number: prior.itemNumber,
          },
        },
        client,
        orgId,
      );
    } catch (err) {
      console.warn('linkReturnedSerial: RETURNED event failed (non-fatal)', err);
    }

    return {
      linked: true,
      allocationReturned,
      promotedToFound: persisted.promotedToFound,
      linePatch: buildReturnLinkagePatch(input.receivingLineId, prior.orderId, persisted),
      matchedOrder: {
        order_pk: prior.orderPk,
        order_id: prior.orderId,
        item_number: prior.itemNumber,
        account_source: prior.accountSource,
        product_title: prior.productTitle,
        sku: prior.sku,
        condition: prior.condition,
        tracking_number: prior.trackingNumber,
        listing_url: persisted.listingUrl,
        via: prior.via,
      },
    };
  });

  const knownReturn = result.linked || input.priorStatus === 'SHIPPED';
  // Studio tap (Tap 1, §7.1 of the returns-unification plan):
  if (knownReturn) {
  await deps.tap({
    serialUnitId: input.serialUnitId,
    event: 'return_received',
    orgId,
    staffId: input.staffId ?? null,
    source: 'scan',
  });
  }

  // "Why" signal (plan §2.3 emitter #1 — return reasons, incl.
  if (knownReturn) {
    await (deps.emitSignal ?? emitEntitySignalSafe)({
    organizationId: orgId,
    entityType: 'SERIAL_UNIT',
    entityId: input.serialUnitId,
    signalKind: 'return_reason',
    notes: reason,
    actorStaffId: input.staffId ?? null,
    meta: {
      receivingLineId: input.receivingLineId,
      receivingId: input.receivingId ?? null,
      linked: result.linked,
      orderId: result.matchedOrder?.order_id ?? null,
      orderPk: result.matchedOrder?.order_pk ?? null,
      matchedVia: result.matchedOrder?.via ?? null,
    },
  });
  }

  // A physical return with NO matching sales order — record a line-level "investigate" exception so it surfaces in the Unfound/triage queue…
  if (knownReturn && !result.linked) {
    try {
      await (deps.recordException ?? recordReceivingException)(orgId, {
        receivingLineId: input.receivingLineId,
        receivingId: input.receivingId ?? null,
        exceptionCode: 'RETURN_NO_ORDER',
        reason: `Returned serial ${input.normalizedSerial} has no matching sales order`,
        createdBy: input.staffId ?? null,
      });
    } catch (err) {
      console.warn('linkReturnedSerial: RETURN_NO_ORDER exception record failed (non-fatal)', err);
    }
  }

  return result;
}

// ─── Entry 2: import a sales order by its order number ───────────────────────────

interface ImportSalesOrderInput {
  orderNumber: string;
  receivingLineId: number;
  receivingId: number | null;
  staffId?: number | null;
  clientEventId?: string | null;
  reason?: string | null;
}

interface ImportSalesOrderResult {
  /** True when the order resolved AND the (eligible) carton was reclassified. */
  imported: boolean;
  promotedToFound: boolean;
  matchedOrder: ReturnedSerialMatchedOrder | null;
  /**
   * Optimistic receiving-line row patch the PO# field applies via
   * `dispatchLineUpdated` — no `/api/receiving-lines` refetch. Null when the
   * value didn't resolve to an eligible sales order.
   */
  linePatch: ReturnLinkageLinePatch | null;
}

interface ImportSalesOrderDeps extends PersistLinkageDeps {
  runTransaction: <T>(orgId: OrgId, cb: (client: PoolClient) => Promise<T>) => Promise<T>;
  recordInventoryEvent: typeof recordInventoryEvent;
}

const importDefaultDeps: ImportSalesOrderDeps = {
  runTransaction: withTenantTransaction,
  upsertReceivingLineReturn,
  resolveReceivingExceptionsByReceivingId,
  recordInventoryEvent,
  listingUrlForItemNumber: getExternalUrlByItemNumber,
  transitionLine: transitionReceivingLine,
  upsertUnbox: upsertReceivingUnbox,
};

interface OrderRow {
  order_pk: number;
  order_id: string | null;
  item_number: string | null;
  account_source: string | null;
  product_title: string | null;
  sku: string | null;
  condition: string | null;
}

/** Import a sales order onto a carton/line by its ORDER NUMBER (the manual counterpart to a returned-serial scan — no serial, so no… */
export async function importSalesOrderByNumber(
  input: ImportSalesOrderInput,
  orgId: OrgId,
  deps: ImportSalesOrderDeps = importDefaultDeps,
): Promise<ImportSalesOrderResult> {
  const orderNumber = (input.orderNumber || '').trim();
  if (!orderNumber) return { imported: false, promotedToFound: false, matchedOrder: null, linePatch: null };
  const reason = input.reason?.trim() || 'sales order import (unbox)';

  return deps.runTransaction(orgId, async (client) => {
    // Prior link state — the return_reason signal below fires only on a
    // FIRST/CHANGED link, so re-committing the same order number never
    // double-counts one physical return in the "top reasons" aggregates.
    const priorLink = await client.query<{ source_order_id: string | null }>(
      `SELECT source_order_id FROM receiving_line WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [input.receivingLineId, orgId],
    );
    const priorSourceOrderId = priorLink.rows[0]?.source_order_id ?? null;

    // Exact, org-anchored match on order_id — uses idx_orders_order_id.
    const r = await client.query<OrderRow>(
      `SELECT id AS order_pk, order_id, item_number, account_source,
              product_title, sku, condition
         FROM orders
        WHERE order_id = $1 AND organization_id = $2
        ORDER BY id ASC
        LIMIT 1`,
      [orderNumber, orgId],
    );
    const o = r.rows[0];
    if (!o || !o.order_id) {
      return { imported: false, promotedToFound: false, matchedOrder: null, linePatch: null };
    }

    const persisted = await persistReturnLinkage(
      client,
      {
        receivingLineId: input.receivingLineId,
        receivingId: input.receivingId,
        order: {
          orderPk: o.order_pk,
          orderId: o.order_id,
          itemNumber: o.item_number,
          accountSource: o.account_source,
          productTitle: o.product_title,
          sku: o.sku,
        },
        reason,
        actorStaffId: input.staffId ?? null,
      },
      orgId,
      deps,
    );

    // Carton-level NOTE (no unit) so the import shows on the carton timeline.
    if (persisted.eligible) {
      try {
        await deps.recordInventoryEvent(
          {
            event_type: 'NOTE',
            actor_staff_id: input.staffId ?? null,
            station: 'RECEIVING',
            receiving_id: input.receivingId,
            receiving_line_id: input.receivingLineId,
            sku: o.sku,
            client_event_id: input.clientEventId ? `${input.clientEventId}:so-import` : null,
            notes: `Sales order ${o.order_id} imported as a return`,
            payload: { return_link: true, sales_order_import: true, order_id: o.order_id, order_pk: o.order_pk },
          },
          client,
          orgId,
        );
      } catch (err) {
        console.warn('importSalesOrderByNumber: NOTE event failed (non-fatal)', err);
      }

      // "Why" signal (plan §2.3 emitter #1, manual-import variant). Rides the
      // caller transaction via `client` (SAVEPOINT-guarded); never throws.
      // Gated on first/changed link — a repeat of the same order# is a no-op.
      if (priorSourceOrderId !== o.order_id) await emitEntitySignalSafe({
        organizationId: orgId,
        entityType: 'RECEIVING_LINE',
        entityId: input.receivingLineId,
        signalKind: 'return_reason',
        notes: reason,
        actorStaffId: input.staffId ?? null,
        meta: {
          receivingId: input.receivingId ?? null,
          orderId: o.order_id,
          orderPk: o.order_pk,
          matchedVia: 'order_number',
        },
        client,
      });
    }

    return {
      imported: persisted.eligible,
      promotedToFound: persisted.promotedToFound,
      linePatch: buildReturnLinkagePatch(input.receivingLineId, o.order_id, persisted),
      matchedOrder: {
        order_pk: o.order_pk,
        order_id: o.order_id,
        item_number: o.item_number,
        account_source: o.account_source,
        product_title: o.product_title,
        sku: o.sku,
        condition: o.condition,
        tracking_number: null,
        listing_url: persisted.listingUrl,
        via: 'order_number',
      },
    };
  });
}

// ─── Entry 3: read-only shipped-order lookup + serial compare ─────────────────────

/** The compare outcome of a received serial against the serials we shipped on a resolved order: */
export type SerialCompareOutcome = 'match' | 'mismatch' | 'no_received' | 'no_shipped_serial';

export interface ShippedOrderCompare {
  found: boolean;
  order: {
    order_pk: number;
    order_id: string | null;
    product_title: string | null;
    sku: string | null;
    item_number: string | null;
    account_source: string | null;
    tracking_number: string | null;
    listing_url: string | null;
  } | null;
  /** Distinct serials we shipped on this order (v2 allocations ∪ legacy tech serials). */
  shipped_serials: string[];
  serial_match: SerialCompareOutcome;
}

interface ShippedOrderCompareDeps {
  query: typeof tenantQuery;
  listingUrlForItemNumber: (itemNumber: string | null | undefined) => string | null;
  normalize: (raw: string | null | undefined) => string;
}

const compareDefaultDeps: ShippedOrderCompareDeps = {
  query: tenantQuery,
  listingUrlForItemNumber: getExternalUrlByItemNumber,
  normalize: normalizeSerial,
};

interface CompareOrderRow {
  order_pk: number;
  order_id: string | null;
  product_title: string | null;
  sku: string | null;
  item_number: string | null;
  account_source: string | null;
  shipment_id: number | null;
  tracking_number: string | null;
}

/** READ-ONLY. Resolve a shipped sales order by its ORDER NUMBER and compare the serial(s) we shipped on it against a received serial (the… */
export async function lookupShippedOrderForCompare(
  input: { orderNumber: string; receivedSerial?: string | null },
  orgId: OrgId,
  deps: ShippedOrderCompareDeps = compareDefaultDeps,
): Promise<ShippedOrderCompare> {
  const orderNumber = (input.orderNumber || '').trim();
  const notFound: ShippedOrderCompare = {
    found: false,
    order: null,
    shipped_serials: [],
    serial_match: 'no_shipped_serial',
  };
  if (!orderNumber) return notFound;

  // 1. Resolve the shipped order by its exact order number (org-scoped). Exact,
  //    un-case-folded match honors idx_orders_order_id — same as
  //    importSalesOrderByNumber (a case-fold wrapper defeats the index).
  const orderRes = await deps.query<CompareOrderRow>(
    orgId,
    `SELECT o.id AS order_pk, o.order_id, o.product_title, o.sku, o.item_number,
            o.account_source, o.shipment_id, stn.tracking_number_raw AS tracking_number
       FROM orders o
       LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
      WHERE o.order_id = $1 AND o.organization_id = $2
      ORDER BY o.id ASC
      LIMIT 1`,
    [orderNumber, orgId],
  );
  const o = orderRes.rows[0];
  if (!o) return notFound;

  // 2. Serials we shipped on this order: the inventory-v2 allocation link
  //    (order_unit_allocations → serial_units) UNION the legacy ship path
  //    (tech_serial_numbers by the order's shipment). Both org-scoped.
  const serialRes = await deps.query<{ serial_number: string | null }>(
    orgId,
    `SELECT su.serial_number AS serial_number
       FROM order_unit_allocations oua
       JOIN serial_units su ON su.id = oua.serial_unit_id
      WHERE oua.order_id = $1 AND oua.organization_id = $2
        AND su.serial_number IS NOT NULL
      UNION
     SELECT t.serial_number AS serial_number
       FROM tech_serial_numbers t
      WHERE t.shipment_id = $3 AND t.organization_id = $2
        AND t.serial_number IS NOT NULL`,
    [o.order_pk, orgId, o.shipment_id],
  );
  const shippedSerials = serialRes.rows
    .map((r) => (r.serial_number || '').trim())
    .filter(Boolean);

  // 3. Compare the received serial against the shipped set (normalized).
  const received = deps.normalize(input.receivedSerial);
  let serialMatch: SerialCompareOutcome;
  if (!received) serialMatch = 'no_received';
  else if (shippedSerials.length === 0) serialMatch = 'no_shipped_serial';
  else {
    const shippedNorm = new Set(shippedSerials.map((s) => deps.normalize(s)));
    serialMatch = shippedNorm.has(received) ? 'match' : 'mismatch';
  }

  return {
    found: true,
    order: {
      order_pk: o.order_pk,
      order_id: o.order_id,
      product_title: o.product_title,
      sku: o.sku,
      item_number: o.item_number,
      account_source: o.account_source,
      tracking_number: o.tracking_number,
      listing_url: deps.listingUrlForItemNumber(o.item_number),
    },
    shipped_serials: shippedSerials,
    serial_match: serialMatch,
  };
}

// ─── Order-number typeahead (read-only) ───────────────────────────────────────

export interface ShippedOrderSuggestion {
  order_pk: number;
  order_id: string;
  product_title: string | null;
  sku: string | null;
}

interface ShippedOrderSuggestDeps {
  query: typeof tenantQuery;
}

const suggestDefaultDeps: ShippedOrderSuggestDeps = { query: tenantQuery };

/** READ-ONLY typeahead behind the Order # search: */
export async function suggestShippedOrdersByNumber(
  query: string,
  orgId: OrgId,
  deps: ShippedOrderSuggestDeps = suggestDefaultDeps,
): Promise<ShippedOrderSuggestion[]> {
  const q = (query || '').trim();
  if (q.length < 2) return [];
  const res = await deps.query<{
    order_pk: number;
    order_id: string | null;
    product_title: string | null;
    sku: string | null;
  }>(
    orgId,
    `SELECT o.id AS order_pk, o.order_id, o.product_title, o.sku
       FROM orders o
      WHERE o.organization_id = $2
        AND o.order_id IS NOT NULL
        AND o.order_id ILIKE $1
      ORDER BY (lower(o.order_id) = lower($3)) DESC, length(o.order_id) ASC, o.id DESC
      LIMIT 8`,
    [`%${q}%`, orgId, q],
  );
  return res.rows
    .filter((r): r is typeof r & { order_id: string } => Boolean(r.order_id))
    .map((r) => ({
      order_pk: r.order_pk,
      order_id: String(r.order_id),
      product_title: r.product_title,
      sku: r.sku,
    }));
}

// ─── Entry 4: log an unmatched received serial INTO the system ────────────────────

interface LogUnmatchedSerialInput {
  serialNumber: string;
  /** The receiving line to PAIR the serial to (the unfound record). */
  receivingLineId?: number | null;
  receivingId?: number | null;
  /** The order number the operator compared against (for the investigate note). */
  orderNumber?: string | null;
  /** The serial we shipped on that order (closest), recorded on the note. */
  shippedSerial?: string | null;
  serialMatch?: SerialCompareOutcome | null;
  conditionGrade?: string | null;
  staffId?: number | null;
  clientEventId?: string | null;
}

interface LogUnmatchedSerialResult {
  serialUnitId: number | null;
  isNew: boolean;
  /** True when the serial was paired to a receiving line (vs registry-only). */
  pairedToLine: boolean;
  /** True when the serial was already on that line (idempotent re-log). */
  alreadyAttached: boolean;
}

export interface LogUnmatchedSerialDeps {
  attachSerialToLine: typeof attachSerialToLine;
  recordReceivingException: typeof recordReceivingException;
  runTransaction: <T>(orgId: OrgId, cb: (client: PoolClient) => Promise<T>) => Promise<T>;
  upsertSerialUnit: typeof upsertSerialUnit;
  recordInventoryEvent: typeof recordInventoryEvent;
  upsertReceivingTriage: typeof upsertReceivingTriage;
  emitSignal?: typeof emitEntitySignalSafe;
}

const logSerialDefaultDeps: LogUnmatchedSerialDeps = {
  attachSerialToLine,
  recordReceivingException,
  runTransaction: withTenantTransaction,
  upsertSerialUnit,
  recordInventoryEvent,
  upsertReceivingTriage,
  emitSignal: emitEntitySignalSafe,
};

/** Record that this carton's pairing question is ANSWERED: */
async function settleReturnPairing(
  receivingId: number,
  orgId: OrgId,
  deps: LogUnmatchedSerialDeps,
): Promise<void> {
  await deps.runTransaction(orgId, async (client) => {
    await deps.upsertReceivingTriage(client, orgId, receivingId, {
      pairingState: 'WAIVED',
      preserveMatchedPairing: true,
    });
  });
}

/** Log a received serial that had no platform/order match as an UNFOUND record, PAIRED to its receiving line. */
export async function logUnmatchedReturnSerial(
  input: LogUnmatchedSerialInput,
  orgId: OrgId,
  deps: LogUnmatchedSerialDeps = logSerialDefaultDeps,
): Promise<LogUnmatchedSerialResult> {
  const serial = (input.serialNumber || '').trim();
  if (!serial) {
    return { serialUnitId: null, isNew: false, pairedToLine: false, alreadyAttached: false };
  }
  const reason = input.orderNumber
    ? `Unmatched return serial ${serial} — no order match (compared to order ${input.orderNumber})`
    : `Unmatched return serial ${serial} — no order match`;

  // ── Paired path — attach the serial to the receiving line (the unfound record).
  if (input.receivingLineId != null && input.receivingLineId > 0) {
    const attached = await deps.attachSerialToLine(
      {
        receiving_line_id: input.receivingLineId,
        serial_number: serial,
        condition_grade: input.conditionGrade ?? null,
        staff_id: input.staffId ?? null,
        station: 'RECEIVING',
        client_event_id: input.clientEventId,
      },
      orgId,
    );
    if (!attached) {
      return { serialUnitId: null, isNew: false, pairedToLine: false, alreadyAttached: false };
    }

    // Log the unfound/investigate exception on the paired line (surfaces in the
    // Unfound/triage queue). Best-effort — the pairing already succeeded.
    try {
      await deps.recordReceivingException(orgId, {
        receivingLineId: input.receivingLineId,
        receivingId: input.receivingId ?? null,
        exceptionCode: 'RETURN_NO_ORDER',
        reason,
        createdBy: input.staffId ?? null,
      });
    } catch (err) {
      console.warn('logUnmatchedReturnSerial: RETURN_NO_ORDER exception failed (non-fatal)', err);
    }

    // The pairing question is now answered — record it (see settleReturnPairing).
    if (input.receivingId != null && input.receivingId > 0) {
      try {
        await settleReturnPairing(input.receivingId, orgId, deps);
      } catch (err) {
        console.warn('logUnmatchedReturnSerial: pairing settle failed (non-fatal)', err);
      }
    }

    // Investigate NOTE capturing the order compared + verdict (order-less rows
    // carry no NOTE otherwise). Runs outside the attach txn; best-effort.
    try {
      await deps.recordInventoryEvent(
        {
          event_type: 'NOTE',
          actor_staff_id: input.staffId ?? null,
          station: 'RECEIVING',
          receiving_id: input.receivingId ?? null,
          receiving_line_id: input.receivingLineId,
          serial_unit_id: attached.serial_unit.id,
          sku: attached.serial_unit.sku ?? null,
          client_event_id: input.clientEventId ? `${input.clientEventId}:log-serial` : null,
          notes: reason,
          payload: {
            unmatched_return_serial: true,
            order_number: input.orderNumber ?? null,
            shipped_serial: input.shippedSerial ?? null,
            serial_match: input.serialMatch ?? null,
          },
        },
        undefined,
        orgId,
      );
    } catch (err) {
      console.warn('logUnmatchedReturnSerial: NOTE event failed (non-fatal)', err);
    }

    return {
      serialUnitId: attached.serial_unit.id,
      isNew: attached.is_new,
      pairedToLine: true,
      alreadyAttached: attached.already_attached,
    };
  }

  // ── Registry fallback — no line to pair to; still add the serial to the system.
  return deps.runTransaction(orgId, async (client) => {
    const upserted = await deps.upsertSerialUnit(
      {
        serial_number: serial,
        origin_source: 'manual',
        condition_grade: input.conditionGrade ?? null,
      },
      { dbClient: client },
      orgId,
    );
    if (!upserted) {
      return { serialUnitId: null, isNew: false, pairedToLine: false, alreadyAttached: false };
    }
    const serialUnitId = upserted.unit.id;

    try {
      await deps.recordInventoryEvent(
        {
          event_type: 'NOTE',
          actor_staff_id: input.staffId ?? null,
          station: 'RECEIVING',
          receiving_id: input.receivingId ?? null,
          serial_unit_id: serialUnitId,
          sku: upserted.unit.sku ?? null,
          client_event_id: input.clientEventId ? `${input.clientEventId}:log-serial` : null,
          notes: reason,
          payload: {
            unmatched_return_serial: true,
            order_number: input.orderNumber ?? null,
            shipped_serial: input.shippedSerial ?? null,
            serial_match: input.serialMatch ?? null,
          },
        },
        client,
        orgId,
      );
    } catch (err) {
      console.warn('logUnmatchedReturnSerial: NOTE event failed (non-fatal)', err);
    }

    await (deps.emitSignal ?? emitEntitySignalSafe)({
      organizationId: orgId,
      entityType: 'SERIAL_UNIT',
      entityId: serialUnitId,
      signalKind: 'return_reason',
      notes: reason,
      actorStaffId: input.staffId ?? null,
      meta: {
        receivingId: input.receivingId ?? null,
        orderNumber: input.orderNumber ?? null,
        shippedSerial: input.shippedSerial ?? null,
        serialMatch: input.serialMatch ?? null,
      },
    });

    return { serialUnitId, isNew: upserted.is_new, pairedToLine: false, alreadyAttached: false };
  });
}
