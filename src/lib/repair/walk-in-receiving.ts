/**
 * A drop-off repair is received the moment its ticket is written (owner
 * 2026-09-29): the ticket lands a REPAIR inbound order through the one inbound
 * writer (`ingestInboundOrderInTx`) on the SAME transaction, and the ticket
 * points at the receiving line it became (`repair_service.receiving_line_id`).
 *
 * Identity: the order number is `RS-{id}` — the ticket's permanent handle
 * (`ticket_number` is re-keyed to the helpdesk number later, the id never is).
 * Idempotent twice over: an already-linked ticket is a no-op, and a re-landing
 * of the same order is the ingest's own "unchanged" path.
 *
 * Server-only (runs on a tenant transaction client).
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { emptyInboundOrderLine, type InboundOrderDraft } from '@/lib/inbound/inbound-order-draft';
import {
  ingestInboundOrderInTx,
  REPAIR_DROP_OFF_SOURCE,
  type InboundOrderOrigin,
} from '@/lib/inbound/ingest-inbound-order';
import type { TxClient } from '@/lib/inbound/purchase-links';

/** The fields of a drop-off ticket its receiving record is built from. */
export interface WalkInRepairTicket {
  id: number;
  productTitle: string;
  /** Civil date (YYYY-MM-DD) the device was handed over; null = unknown. */
  receivedOn: string | null;
}

export interface WalkInRepairReceipt {
  receivingId: number | null;
  receivingLineId: number;
  inboundOrderId: number | null;
  /** False when the ticket was already linked or the order landed unchanged. */
  created: boolean;
}

export interface ReceiveWalkInRepairDeps {
  ingest: typeof ingestInboundOrderInTx;
}

const defaultDeps: ReceiveWalkInRepairDeps = { ingest: ingestInboundOrderInTx };

/** The inbound order number a drop-off ticket lands under. */
export function walkInRepairOrderNumber(repairId: number): string {
  return `RS-${repairId}`;
}

/** The ticket as an inbound order: one device, one line, in hand — no tracking, no cost, no supplier. */
export function walkInRepairInboundDraft(ticket: WalkInRepairTicket): InboundOrderDraft {
  const orderNumber = walkInRepairOrderNumber(ticket.id);
  const receivedOn = ticket.receivedOn && /^\d{4}-\d{2}-\d{2}$/.test(ticket.receivedOn) ? ticket.receivedOn : null;
  return {
    type: 'REPAIR',
    platform: 'manual',
    orderNumber,
    vendor: '',
    accountName: '',
    priority: 'auto',
    orderDate: receivedOn,
    expectedDate: null,
    currency: 'USD',
    tracking: [],
    lines: [{ ...emptyInboundOrderLine(), title: ticket.productTitle.trim() || `Repair ${orderNumber}`, quantity: 1 }],
    notes: '',
    returnReason: '',
    rmaId: '',
  };
}

/**
 * Land (or find) the ticket's receiving record and link it, on the caller's
 * transaction. Also stamps `intake_channel = 'pickup'`: a ticket with a
 * drop-off receiving record was dropped off.
 */
export async function receiveWalkInRepairInTx(
  client: TxClient,
  orgId: OrgId,
  ticket: WalkInRepairTicket,
  ctx: { staffId: number | null; origin?: Extract<InboundOrderOrigin, 'manual' | 'backfill'> },
  deps: ReceiveWalkInRepairDeps = defaultDeps,
): Promise<WalkInRepairReceipt> {
  const existing = await client.query<{ receiving_line_id: number | null; receiving_id: number | null; inbound_order_id: number | null }>(
    `SELECT rs.receiving_line_id, rl.receiving_id, rl.inbound_order_id
       FROM repair_service rs
       LEFT JOIN receiving_line rl
         ON rl.id = rs.receiving_line_id AND rl.organization_id = rs.organization_id
      WHERE rs.id = $1 AND rs.organization_id = $2
      FOR UPDATE OF rs`,
    [ticket.id, orgId],
  );
  const row = existing.rows[0];
  if (!row) throw new Error(`repair ${ticket.id} is not in this organization`);
  if (row.receiving_line_id != null) {
    return {
      receivingId: row.receiving_id != null ? Number(row.receiving_id) : null,
      receivingLineId: Number(row.receiving_line_id),
      inboundOrderId: row.inbound_order_id != null ? Number(row.inbound_order_id) : null,
      created: false,
    };
  }

  const landed = await deps.ingest(client, orgId, walkInRepairInboundDraft(ticket), {
    origin: ctx.origin ?? 'manual',
    source: REPAIR_DROP_OFF_SOURCE,
    staffId: ctx.staffId,
    sourceEventId: `repair:${ticket.id}`,
  });
  const line = landed.lines[0];
  if (!line) throw new Error(`repair ${ticket.id} landed no receiving line`);

  await client.query(
    `UPDATE repair_service
        SET receiving_line_id = $1,
            intake_channel = 'pickup',
            updated_at = NOW()
      WHERE id = $2 AND organization_id = $3`,
    [line.receivingLineId, ticket.id, orgId],
  );
  // The carton arrived when the customer handed the device over — not when a
  // backfill happened to land it.
  if (landed.receivingId != null && !landed.unchanged) {
    await client.query(
      `UPDATE receiving_carton rc
          SET receiving_date_time = COALESCE(rs.received_at, rs.created_at, rc.receiving_date_time),
              updated_at = NOW()
         FROM repair_service rs
        WHERE rc.id = $1 AND rc.organization_id = $3
          AND rs.id = $2 AND rs.organization_id = $3`,
      [landed.receivingId, ticket.id, orgId],
    );
  }
  return {
    receivingId: landed.receivingId,
    receivingLineId: line.receivingLineId,
    inboundOrderId: landed.inboundOrderId,
    created: !landed.unchanged,
  };
}
