/**
 * Pure ticket↔receiving reference helpers — client-safe.
 *
 * Split out of `tickets.ts` (which owns the DB reads/writes via `tenancy/db`)
 * so client hooks like `useEntitySupportTicket` can normalize refs without
 * dragging the server-only Neon driver into their bundle. `tickets.ts`
 * re-exports everything here, so server callers keep their import path.
 */

export interface TicketReceivingRef {
  receivingId: number;
  lineId?: number;
  supportTicketId: number;
}

/** Synthetic line id (`-receiving_id`) for unfound cartons with no receiving_line row. */
function isPlaceholderReceivingLineId(lineId: number | null | undefined): boolean {
  return lineId != null && lineId <= 0;
}

/** Map placeholder line ids to the real carton id for ticket resolution / linking.
 *  Unmatched stubs use `id = -receiving_id` with `receiving_id` already set.
 *  Pending scan stubs (`scan:…`) use a hashed negative id with `receiving_id`
 *  null — never invent a carton id from that hash. */
export function normalizeReceivingTicketEntityRefs(args: {
  lineId?: number | null;
  receivingId?: number | null;
}): { lineId: number | null; receivingId: number | null } {
  let lineId = args.lineId ?? null;
  const receivingId = args.receivingId ?? null;
  if (isPlaceholderReceivingLineId(lineId)) {
    lineId = null;
  }
  return { lineId, receivingId };
}

export type TicketLinkEntityType = 'SHIPMENT' | 'RECEIVING' | 'RECEIVING_LINE';

export interface TicketLinkAnchor {
  entityType: TicketLinkEntityType;
  entityId: number;
}

/**
 * Pick the single primary ticket_links entity for a Zendesk ticket.
 * One ticket → one entity (UNIQUE on org + zendesk_ticket_id).
 *
 * Priority: line > carton > shipment (STN). Prefer the richest receiving
 * context when a carton is open; fall back to SHIPMENT for pre-intake
 * tracking links (support / packing surfaces).
 */
export function pickTicketLinkAnchor(args: {
  lineId?: number | null;
  receivingId?: number | null;
  shipmentId?: number | null;
}): TicketLinkAnchor | null {
  const { lineId, receivingId } = normalizeReceivingTicketEntityRefs({
    lineId: args.lineId ?? null,
    receivingId: args.receivingId ?? null,
  });
  if (lineId != null) {
    return { entityType: 'RECEIVING_LINE', entityId: lineId };
  }
  if (receivingId != null) {
    return { entityType: 'RECEIVING', entityId: receivingId };
  }
  const shipmentId = args.shipmentId ?? null;
  if (shipmentId != null && Number.isFinite(shipmentId) && shipmentId > 0) {
    return { entityType: 'SHIPMENT', entityId: shipmentId };
  }
  return null;
}

/** Entity ref written to ticket_links when filing a claim. */
export function claimTicketLinkEntity(
  lineId: number | null | undefined,
  receivingId: number,
): { entityType: 'RECEIVING' | 'RECEIVING_LINE'; entityId: number } {
  const picked = pickTicketLinkAnchor({ lineId, receivingId });
  if (picked && (picked.entityType === 'RECEIVING' || picked.entityType === 'RECEIVING_LINE')) {
    return { entityType: picked.entityType, entityId: picked.entityId };
  }
  return { entityType: 'RECEIVING', entityId: receivingId };
}
