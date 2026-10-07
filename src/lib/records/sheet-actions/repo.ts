/**
 * SQL behind the Records sheet's writes — the default `Deps` of the domain
 * modules beside this file. Every function runs on the caller's tenant
 * transaction and names the org; the domain decides what to call.
 */

import 'server-only';

import type { OrgId } from '@/lib/tenancy/constants';
import type { RecordTarget } from '@/lib/records/sheet-actions-contract';
import { accountSourceAccountLabelSql } from '@/lib/orders/account-source';
import { sqlOrderIsPicked } from '@/lib/picking/picked-by';
import { deleteOrderInTx } from '@/lib/neon/orders-queries';
import { deleteShipmentTrackingLink } from '@/lib/neon/orders-tracking-queries';
import { linkShipment, unlinkShipment } from '@/lib/shipping/shipment-links';
import { registerShipmentPermissive } from '@/lib/shipping/sync-shipment';
import {
  INBOUND_LINE_DELETE_BLOCKER_SQL,
  deleteInboundLinesInTx,
  deleteInboundOrderShellInTx,
} from '@/lib/inbound/ingest-inbound-order';
import { updateInboundIdentityInTx } from '@/lib/inbound/update-identity';
import { createOrderNotesInTx } from '@/lib/orders/order-notes';
import { setOrderFlagsInTx } from '@/lib/orders/order-flags';
import { isOrderRowFlagId, type OrderRowFlagId } from '@/lib/orders/order-row-flags';
import { upsertOrderAssignment, upsertOrderDeadline } from '@/lib/work-assignments/upsert-order-assignment';
import type { Tx } from './types';

/** `shipment_links.source` for every link the sheet writes. */
export const RECORDS_LINK_SOURCE = 'records.sheet';

export interface OutboundLineRow {
  id: number;
  orderNumber: string | null;
  accountSource: string | null;
  externalLineId: string | null;
  /** Platform account label, else the raw account_source. */
  platformLabel: string | null;
  primaryShipmentId: number | null;
  linkedShipmentIds: number[];
}

export interface InboundLineRow {
  id: number;
  primaryShipmentId: number | null;
  linkedShipmentIds: number[];
  inboundOrderId: number | null;
  sourceType: string | null;
  sourceOrderId: string | null;
}

const toId = (v: unknown): number | null => (v == null ? null : Number(v));
const toIds = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number) : []);

export async function loadOutboundLines(tx: Tx, orgId: OrgId, ids: readonly number[]): Promise<OutboundLineRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await tx.query(
    `SELECT o.id, o.order_id, o.account_source, o.external_line_id, o.shipment_id,
            COALESCE(${accountSourceAccountLabelSql('o')}, o.account_source) AS platform_label,
            ARRAY(SELECT sl.shipment_id FROM shipment_links sl
                   WHERE sl.organization_id = o.organization_id AND sl.owner_type = 'ORDER' AND sl.owner_id = o.id
                   ORDER BY sl.box_seq, sl.id) AS linked
       FROM orders o
      WHERE o.organization_id = $1 AND o.id = ANY($2::int[])
      FOR UPDATE OF o`,
    [orgId, [...ids]],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    orderNumber: r.order_id ?? null,
    accountSource: r.account_source ?? null,
    externalLineId: r.external_line_id ?? null,
    platformLabel: r.platform_label ?? null,
    primaryShipmentId: toId(r.shipment_id),
    linkedShipmentIds: toIds(r.linked),
  }));
}

export async function loadInboundLines(tx: Tx, orgId: OrgId, ids: readonly number[]): Promise<InboundLineRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await tx.query(
    `SELECT rl.id, rl.shipment_id, rl.inbound_order_id, rl.inbound_source_type, rl.source_order_id,
            ARRAY(SELECT sl.shipment_id FROM shipment_links sl
                   WHERE sl.organization_id = rl.organization_id AND sl.owner_type = 'RECEIVING_LINE' AND sl.owner_id = rl.id
                   ORDER BY sl.box_seq, sl.id) AS linked
       FROM receiving_line rl
      WHERE rl.organization_id = $1 AND rl.id = ANY($2::int[])
      FOR UPDATE OF rl`,
    [orgId, [...ids]],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    primaryShipmentId: toId(r.shipment_id),
    linkedShipmentIds: toIds(r.linked),
    inboundOrderId: toId(r.inbound_order_id),
    sourceType: r.inbound_source_type ? String(r.inbound_source_type).trim().toLowerCase() : null,
    sourceOrderId: r.source_order_id ? String(r.source_order_id).trim() : null,
  }));
}

// ─── Tracking ────────────────────────────────────────────────────────────────

/** Register (or find) the tracking row — before the transaction, like every inbound writer. */
export async function registerTracking(tracking: string, orgId: OrgId): Promise<number | null> {
  const shipment = await registerShipmentPermissive({ trackingNumber: tracking, sourceSystem: RECORDS_LINK_SOURCE }, orgId);
  return shipment?.id != null ? Number(shipment.id) : null;
}

/** Outbound lines that carry the shipment (primary column or an ORDER link). */
export async function shipmentOrderOwners(
  tx: Tx,
  orgId: OrgId,
  shipmentId: number,
): Promise<Array<{ id: number; orderNumber: string | null; accountSource: string | null }>> {
  const { rows } = await tx.query(
    `SELECT o.id, o.order_id, o.account_source
       FROM orders o
      WHERE o.organization_id = $1
        AND o.id IN (SELECT id FROM orders WHERE organization_id = $1 AND shipment_id = $2
                     UNION
                     SELECT owner_id FROM shipment_links
                      WHERE organization_id = $1 AND owner_type = 'ORDER' AND shipment_id = $2)`,
    [orgId, shipmentId],
  );
  return rows.map((r) => ({ id: Number(r.id), orderNumber: r.order_id ?? null, accountSource: r.account_source ?? null }));
}

/** Link a shipment to ONE line — as its primary (column + primary link) or as another box. */
export async function linkLineTracking(
  tx: Tx,
  orgId: OrgId,
  line: RecordTarget,
  shipmentId: number,
  primary: boolean,
  staffId: number | null,
): Promise<void> {
  const outbound = line.direction === 'outbound';
  if (primary) {
    await tx.query(
      outbound
        ? `UPDATE orders SET shipment_id = $3 WHERE organization_id = $1 AND id = $2`
        : `UPDATE receiving_line SET shipment_id = $3, updated_at = NOW() WHERE organization_id = $1 AND id = $2`,
      [orgId, line.id, shipmentId],
    );
  }
  await linkShipment(
    orgId,
    {
      ownerType: outbound ? 'ORDER' : 'RECEIVING_LINE',
      ownerId: line.id,
      shipmentId,
      direction: outbound ? 'OUTBOUND' : 'INBOUND',
      isPrimary: primary,
      role: outbound ? (primary ? 'ORDER_PRIMARY' : 'ORDER_SPLIT') : primary ? 'LINE' : 'LINE_SPLIT',
      source: RECORDS_LINK_SOURCE,
      linkedBy: staffId,
    },
    tx,
  );
}

/** Unlink a shipment from ONE line (link row + the line's column when it was the primary); the tracking row stays. */
export async function unlinkLineTracking(tx: Tx, orgId: OrgId, line: RecordTarget, shipmentId: number): Promise<void> {
  if (line.direction === 'outbound') {
    await deleteShipmentTrackingLink([line.id], shipmentId, tx);
    return;
  }
  await unlinkShipment(orgId, 'RECEIVING_LINE', line.id, shipmentId, tx);
  await tx.query(
    `UPDATE receiving_line SET shipment_id = NULL, updated_at = NOW()
      WHERE organization_id = $1 AND id = $2 AND shipment_id = $3`,
    [orgId, line.id, shipmentId],
  );
}

// ─── Order number ────────────────────────────────────────────────────────────

/**
 * A row OUTSIDE `lines` that already holds one of the lines' keys under
 * `orderNumber` — `idx_orders_unique_org_account_order_line` semantics (NULL
 * account_source / external_line_id never collide).
 */
export async function findOrderNumberCollision(
  tx: Tx,
  orgId: OrgId,
  orderNumber: string,
  lines: readonly OutboundLineRow[],
): Promise<{ externalLineId: string; platformLabel: string } | null> {
  const keyed = lines.filter((l) => l.accountSource != null && l.externalLineId != null);
  if (keyed.length === 0) return null;
  const { rows } = await tx.query(
    `SELECT o.external_line_id, COALESCE(${accountSourceAccountLabelSql('o')}, o.account_source) AS platform_label
       FROM orders o
      WHERE o.organization_id = $1 AND o.order_id = $2
        AND NOT (o.id = ANY($3::int[]))
        AND (o.account_source, o.external_line_id) IN (SELECT * FROM unnest($4::text[], $5::text[]))
      LIMIT 1`,
    [
      orgId,
      orderNumber,
      lines.map((l) => l.id),
      keyed.map((l) => l.accountSource),
      keyed.map((l) => l.externalLineId),
    ],
  );
  const row = rows[0];
  return row ? { externalLineId: String(row.external_line_id), platformLabel: String(row.platform_label) } : null;
}

/** How many `orders` rows each order number has in the org. */
export async function orderRowCounts(tx: Tx, orgId: OrgId, orderNumbers: readonly string[]): Promise<Map<string, number>> {
  if (orderNumbers.length === 0) return new Map();
  const { rows } = await tx.query(
    `SELECT order_id, COUNT(*)::int AS n FROM orders
      WHERE organization_id = $1 AND order_id = ANY($2::text[])
      GROUP BY order_id`,
    [orgId, [...orderNumbers]],
  );
  return new Map(rows.map((r) => [String(r.order_id), Number(r.n)]));
}

/** Order numbers with an open (pending / sent) payment request — one allowed per number. */
export async function openPaymentOrderNumbers(tx: Tx, orgId: OrgId, orderNumbers: readonly string[]): Promise<Set<string>> {
  if (orderNumbers.length === 0) return new Set();
  const { rows } = await tx.query(
    `SELECT DISTINCT order_number FROM order_payments
      WHERE organization_id = $1 AND order_number = ANY($2::text[]) AND status IN ('pending', 'sent')`,
    [orgId, [...orderNumbers]],
  );
  return new Set(rows.map((r) => String(r.order_number)));
}

export async function rekeyOrderLines(tx: Tx, orgId: OrgId, ids: readonly number[], orderNumber: string): Promise<void> {
  await tx.query(`UPDATE orders SET order_id = $3 WHERE organization_id = $1 AND id = ANY($2::int[])`, [orgId, [...ids], orderNumber]);
}

/** Payment requests are keyed by order number: carry them when every line of the old number moved. */
export async function moveOrderPayments(tx: Tx, orgId: OrgId, fromNumbers: readonly string[], to: string): Promise<void> {
  if (fromNumbers.length === 0) return;
  await tx.query(
    `UPDATE order_payments SET order_number = $3, updated_at = NOW()
      WHERE organization_id = $1 AND order_number = ANY($2::text[])`,
    [orgId, [...fromNumbers], to],
  );
}

export interface InboundOrderRow {
  id: number;
  sourceType: string;
  orderNumber: string | null;
  lineIds: number[];
}

export async function loadInboundOrders(tx: Tx, orgId: OrgId, ids: readonly number[]): Promise<InboundOrderRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await tx.query(
    `SELECT io.id, io.source_type, io.order_number,
            ARRAY(SELECT rl.id FROM receiving_line rl
                   WHERE rl.organization_id = io.organization_id AND rl.inbound_order_id = io.id
                   ORDER BY rl.id) AS line_ids
       FROM inbound_order io
      WHERE io.organization_id = $1 AND io.id = ANY($2::bigint[])
      FOR UPDATE OF io`,
    [orgId, [...ids]],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    sourceType: String(r.source_type),
    orderNumber: r.order_number ?? null,
    lineIds: toIds(r.line_ids),
  }));
}

/**
 * Rename an inbound order: its display number, and — through the desk's
 * identity writer — the purchase mirror's number when a line carries the
 * marketplace identity.
 */
export async function renameInboundOrder(
  tx: Tx,
  orgId: OrgId,
  inboundOrderId: number,
  orderNumber: string,
  identityLineId: number | null,
): Promise<void> {
  await tx.query(
    `UPDATE inbound_order SET order_number = $3, updated_at = NOW() WHERE organization_id = $1 AND id = $2`,
    [orgId, inboundOrderId, orderNumber],
  );
  if (identityLineId != null) {
    await updateInboundIdentityInTx(tx, orgId, { receivingLineId: identityLineId, orderNumber });
  }
}

// ─── Delete ──────────────────────────────────────────────────────────────────

/**
 * Why an outbound line may not be deleted (null = nothing happened to it on
 * the floor). Alias `o`. Scan-out (a dock SHIP_CONFIRM on the line or any of
 * its shipments), an applied label, a pack (stage facts / pack scan), a pick
 * (the pick resolver, or an ended picking session).
 */
export const OUTBOUND_LINE_DELETE_BLOCKER_SQL = `CASE
  WHEN EXISTS (
    SELECT 1 FROM station_activity_logs so
     WHERE so.organization_id = o.organization_id AND so.activity_type = 'SHIP_CONFIRM'
       AND (so.order_row_id = o.id
            OR so.shipment_id = o.shipment_id
            OR so.shipment_id IN (SELECT sl.shipment_id FROM shipment_links sl
                                   WHERE sl.organization_id = o.organization_id AND sl.owner_type = 'ORDER' AND sl.owner_id = o.id))
  ) THEN 'scanned_out'
  WHEN EXISTS (
    SELECT 1 FROM label_ingestions li
     WHERE li.organization_id = o.organization_id AND li.matched_order_id = o.id AND li.state = 'APPLIED'
  ) THEN 'label_applied'
  WHEN EXISTS (
    SELECT 1 FROM order_stage_facts f
     WHERE f.organization_id = o.organization_id AND f.order_id = o.id
       AND (f.packed_at IS NOT NULL OR f.has_pack_scan)
  ) OR EXISTS (
    SELECT 1 FROM station_activity_logs sal
     WHERE sal.organization_id = o.organization_id
       AND sal.activity_type IN ('PACK_COMPLETED', 'PACK_SCAN')
       AND (sal.order_row_id = o.id OR sal.shipment_id = o.shipment_id)
  ) THEN 'packed'
  WHEN ${sqlOrderIsPicked('o')} OR EXISTS (
    SELECT 1 FROM picking_sessions ps
     WHERE ps.organization_id = o.organization_id AND ps.order_id = o.id
       AND ps.ended_at IS NOT NULL AND NOT COALESCE(ps.abandoned, false)
  ) THEN 'picked'
END`;

export type OutboundDeleteBlocker = 'scanned_out' | 'label_applied' | 'packed' | 'picked';

export interface OutboundDeleteCandidate {
  id: number;
  blocker: OutboundDeleteBlocker | null;
  snapshot: Record<string, unknown>;
}

export async function loadOutboundDeleteCandidates(
  tx: Tx,
  orgId: OrgId,
  ids: readonly number[],
): Promise<OutboundDeleteCandidate[]> {
  if (ids.length === 0) return [];
  const { rows } = await tx.query(
    `SELECT o.id, ${OUTBOUND_LINE_DELETE_BLOCKER_SQL} AS blocker, to_jsonb(o) AS snapshot
       FROM orders o
      WHERE o.organization_id = $1 AND o.id = ANY($2::int[])
      FOR UPDATE OF o`,
    [orgId, [...ids]],
  );
  return rows.map((r) => ({ id: Number(r.id), blocker: r.blocker ?? null, snapshot: r.snapshot ?? {} }));
}

/** The one outbound delete path (`deleteOrderInTx`); throws `OrderDeleteBlockedError`. */
export async function deleteOutboundLine(tx: Tx, orgId: OrgId, id: number, staffId: number | null): Promise<boolean> {
  return deleteOrderInTx(tx, { orderId: id, orgId, actorStaffId: staffId });
}

export interface InboundDeleteCandidate {
  id: number;
  /** INBOUND_LINE_DELETE_BLOCKER_SQL's words, or null. */
  blocker: string | null;
  cartonId: number | null;
  inboundOrderId: number | null;
  snapshot: Record<string, unknown>;
}

export async function loadInboundDeleteCandidates(
  tx: Tx,
  orgId: OrgId,
  ids: readonly number[],
): Promise<InboundDeleteCandidate[]> {
  if (ids.length === 0) return [];
  const { rows } = await tx.query(
    `SELECT rl.id, rl.receiving_id, rl.inbound_order_id,
            ${INBOUND_LINE_DELETE_BLOCKER_SQL} AS blocker,
            to_jsonb(rl) AS snapshot
       FROM receiving_line rl
      WHERE rl.organization_id = $1 AND rl.id = ANY($2::int[])
      FOR UPDATE OF rl`,
    [orgId, [...ids]],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    blocker: r.blocker ?? null,
    cartonId: toId(r.receiving_id),
    inboundOrderId: toId(r.inbound_order_id),
    snapshot: r.snapshot ?? {},
  }));
}

/** `deleteInboundLinesInTx` (RECEIVING_LINE links included), then each named inbound order left with no lines. */
export async function deleteInboundLines(
  tx: Tx,
  orgId: OrgId,
  lineIds: readonly number[],
  cartonIds: readonly number[],
  inboundOrderIds: readonly number[],
): Promise<{ deletedCartonIds: number[]; deletedInboundOrderIds: number[] }> {
  const deletedCartonIds = await deleteInboundLinesInTx(tx, orgId, lineIds, cartonIds);
  const deletedInboundOrderIds: number[] = [];
  if (inboundOrderIds.length > 0) {
    const { rows } = await tx.query(
      `SELECT io.id FROM inbound_order io
        WHERE io.organization_id = $1 AND io.id = ANY($2::bigint[])
          AND NOT EXISTS (SELECT 1 FROM receiving_line rl WHERE rl.organization_id = io.organization_id AND rl.inbound_order_id = io.id)`,
      [orgId, [...inboundOrderIds]],
    );
    for (const r of rows) {
      await deleteInboundOrderShellInTx(tx, orgId, Number(r.id));
      deletedInboundOrderIds.push(Number(r.id));
    }
  }
  return { deletedCartonIds, deletedInboundOrderIds };
}

// ─── Bottom-bar verbs ────────────────────────────────────────────────────────

/** Append the note to each order (`order_notes` + the latest-note column); answers each order's prior latest note. */
export async function addOrderNotes(
  tx: Tx,
  orgId: OrgId,
  ids: readonly number[],
  text: string,
  staffId: number | null,
): Promise<Array<{ id: number; before: string | null }>> {
  if (ids.length === 0) return [];
  const { rows } = await tx.query(
    `SELECT id, notes FROM orders WHERE organization_id = $1 AND id = ANY($2::int[])`,
    [orgId, [...ids]],
  );
  const updated = new Set((await createOrderNotesInTx(tx, rows.map((r) => Number(r.id)), text, staffId)).updatedIds);
  return rows.filter((r) => updated.has(Number(r.id))).map((r) => ({ id: Number(r.id), before: r.notes ?? null }));
}

/** Append to each inbound line's note (`receiving_line.notes`), stamping the face-write clock. */
export async function appendInboundNotes(
  tx: Tx,
  orgId: OrgId,
  ids: readonly number[],
  text: string,
): Promise<Array<{ id: number; before: string | null; after: string | null }>> {
  if (ids.length === 0) return [];
  const { rows } = await tx.query(
    `UPDATE receiving_line rl
        SET notes = CASE WHEN COALESCE(btrim(old.notes), '') = '' THEN $3 ELSE old.notes || E'\\n' || $3 END,
            face_noted_at = NOW(),
            updated_at = NOW()
       FROM receiving_line old
      WHERE rl.organization_id = $1 AND rl.id = ANY($2::int[]) AND old.id = rl.id
      RETURNING rl.id, old.notes AS before, rl.notes AS after`,
    [orgId, [...ids], text],
  );
  return rows.map((r) => ({ id: Number(r.id), before: r.before ?? null, after: r.after ?? null }));
}

/** The canonical ship-by (ORDER / TEST `deadline_at`) of each order. */
export async function orderShipBy(tx: Tx, orgId: OrgId, ids: readonly number[]): Promise<Map<number, string | null>> {
  if (ids.length === 0) return new Map();
  const { rows } = await tx.query(
    `SELECT o.id,
            (SELECT to_char(wa.deadline_at, 'YYYY-MM-DD') FROM work_assignments wa
              WHERE wa.organization_id = o.organization_id AND wa.entity_type = 'ORDER' AND wa.entity_id = o.id
                AND wa.work_type = 'TEST' AND wa.status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')
              ORDER BY CASE wa.status WHEN 'ASSIGNED' THEN 1 WHEN 'IN_PROGRESS' THEN 2 ELSE 3 END, wa.id DESC
              LIMIT 1) AS ship_by
       FROM orders o
      WHERE o.organization_id = $1 AND o.id = ANY($2::int[])`,
    [orgId, [...ids]],
  );
  return new Map(rows.map((r) => [Number(r.id), r.ship_by ?? null]));
}

export async function setOrderShipBy(tx: Tx, orgId: OrgId, ids: readonly number[], date: string | null): Promise<void> {
  for (const id of ids) await upsertOrderDeadline(orgId, id, date, tx);
}

export type OrderStage = 'PICK' | 'PACK';

/** The active picker / packer of each order. */
export async function orderAssignees(
  tx: Tx,
  orgId: OrgId,
  ids: readonly number[],
  stage: OrderStage,
): Promise<Map<number, number | null>> {
  if (ids.length === 0) return new Map();
  const col = stage === 'PACK' ? 'assigned_packer_id' : 'assigned_tech_id';
  const { rows } = await tx.query(
    `SELECT o.id,
            (SELECT wa.${col} FROM work_assignments wa
              WHERE wa.organization_id = o.organization_id AND wa.entity_type = 'ORDER' AND wa.entity_id = o.id
                AND wa.work_type = $3 AND wa.status IN ('ASSIGNED', 'IN_PROGRESS')
              ORDER BY CASE wa.status WHEN 'ASSIGNED' THEN 1 ELSE 2 END, wa.id DESC
              LIMIT 1) AS staff_id
       FROM orders o
      WHERE o.organization_id = $1 AND o.id = ANY($2::int[])`,
    [orgId, [...ids], stage],
  );
  return new Map(rows.map((r) => [Number(r.id), toId(r.staff_id)]));
}

export async function assignOrders(
  tx: Tx,
  orgId: OrgId,
  ids: readonly number[],
  stage: OrderStage,
  staffId: number | null,
): Promise<void> {
  for (const id of ids) await upsertOrderAssignment(orgId, id, stage, staffId, tx);
}

/** Is `staffId` an active staff row of this org (RLS scopes `staff`)? */
export async function activeStaffExists(tx: Tx, staffId: number): Promise<boolean> {
  const { rows } = await tx.query(
    `SELECT 1 FROM staff WHERE id = $1 AND COALESCE(active, true) = true LIMIT 1`,
    [staffId],
  );
  return rows.length > 0;
}

export async function orderFlags(tx: Tx, orgId: OrgId, ids: readonly number[]): Promise<Map<number, OrderRowFlagId | null>> {
  if (ids.length === 0) return new Map();
  const { rows } = await tx.query(
    `SELECT o.id, f.flag
       FROM orders o
       LEFT JOIN order_flags f ON f.order_id = o.id AND f.organization_id = o.organization_id
      WHERE o.organization_id = $1 AND o.id = ANY($2::int[])`,
    [orgId, [...ids]],
  );
  return new Map(rows.map((r) => [Number(r.id), isOrderRowFlagId(r.flag) ? r.flag : null]));
}

export async function setOrderFlags(
  tx: Tx,
  orgId: OrgId,
  ids: readonly number[],
  flag: OrderRowFlagId | null,
  staffId: number | null,
): Promise<void> {
  if (ids.length === 0) return;
  await setOrderFlagsInTx(tx, orgId, ids, flag, staffId);
}
