/**
 * STN ↔ support-ticket pairing helpers (ticket_links SHIPMENT references).
 *
 * Leaf orchestration — inject Deps so unit tests run DB-free. Live defaults
 * that touch Neon live in `ticket-link.ts`.
 */

import type { OrgId } from '@/lib/tenancy/constants';

export type PairTicketShipmentFromReceivingDeps = {
  lookupCartonShipmentId: (
    orgId: OrgId,
    receivingId: number,
  ) => Promise<number | null>;
  addReference: (args: {
    orgId: OrgId;
    ticketId: number;
    shipmentId: number;
    staffId?: number | null;
  }) => Promise<{ shipmentId: number; isPrimary: boolean; added: boolean }>;
};

/**
 * After anchoring a ticket to a receiving carton/line, also reference the
 * carton's STN on `ticket_links` (non-primary when RECEIVING is already the
 * anchor). Idempotent; best-effort callers should catch.
 *
 * Returns null when the carton has no shipment_id (nothing to pair).
 */
export async function pairTicketShipmentFromReceiving(
  args: {
    orgId: OrgId;
    ticketId: number;
    receivingId: number;
    staffId?: number | null;
  },
  deps: PairTicketShipmentFromReceivingDeps,
): Promise<{ shipmentId: number; isPrimary: boolean; added: boolean } | null> {
  const shipmentId = await deps.lookupCartonShipmentId(args.orgId, args.receivingId);
  if (shipmentId == null) return null;
  return deps.addReference({
    orgId: args.orgId,
    ticketId: args.ticketId,
    shipmentId,
    staffId: args.staffId ?? null,
  });
}

export type UnpairTicketShipmentFromReceivingDeps = {
  lookupCartonShipmentId: (
    orgId: OrgId,
    receivingId: number,
  ) => Promise<number | null>;
  removeReference: (args: {
    orgId: OrgId;
    ticketId: number;
    shipmentId: number;
    staffId?: number | null;
  }) => Promise<{ removed: boolean; promotedShipmentId: number | null }>;
};

/**
 * Reverse of {@link pairTicketShipmentFromReceiving}: when detaching a ticket
 * from a receiving carton/line, also drop the carton's STN reference so
 * package-scoped readers (by-entity chip, shipment fallback) clear.
 *
 * Returns null when the carton has no shipment_id (nothing to unpair).
 */
export async function unpairTicketShipmentFromReceiving(
  args: {
    orgId: OrgId;
    ticketId: number;
    receivingId: number;
    staffId?: number | null;
  },
  deps: UnpairTicketShipmentFromReceivingDeps,
): Promise<{
  shipmentId: number;
  removed: boolean;
  promotedShipmentId: number | null;
} | null> {
  const shipmentId = await deps.lookupCartonShipmentId(args.orgId, args.receivingId);
  if (shipmentId == null) return null;
  const result = await deps.removeReference({
    orgId: args.orgId,
    ticketId: args.ticketId,
    shipmentId,
    staffId: args.staffId ?? null,
  });
  return { shipmentId, ...result };
}

export type PairTicketShipmentFromEntityDeps = PairTicketShipmentFromReceivingDeps & {
  lookupLineReceivingId: (orgId: OrgId, lineId: number) => Promise<number | null>;
};

/**
 * When a ticket was just anchored to RECEIVING / RECEIVING_LINE / SHIPMENT,
 * ensure the STN is on `ticket_links`. SHIPMENT anchors are already the STN
 * primary — this is an idempotent re-reference for those.
 */
export async function pairTicketShipmentFromEntity(
  args: {
    orgId: OrgId;
    ticketId: number;
    entityType: string;
    entityId: number;
    staffId?: number | null;
  },
  deps: PairTicketShipmentFromEntityDeps,
): Promise<{ shipmentId: number; isPrimary: boolean; added: boolean } | null> {
  const type = String(args.entityType || '').toUpperCase();
  if (type === 'SHIPMENT') {
    return deps.addReference({
      orgId: args.orgId,
      ticketId: args.ticketId,
      shipmentId: args.entityId,
      staffId: args.staffId ?? null,
    });
  }
  if (type === 'RECEIVING') {
    return pairTicketShipmentFromReceiving(
      {
        orgId: args.orgId,
        ticketId: args.ticketId,
        receivingId: args.entityId,
        staffId: args.staffId ?? null,
      },
      deps,
    );
  }
  if (type === 'RECEIVING_LINE') {
    const receivingId = await deps.lookupLineReceivingId(args.orgId, args.entityId);
    if (receivingId == null) return null;
    return pairTicketShipmentFromReceiving(
      {
        orgId: args.orgId,
        ticketId: args.ticketId,
        receivingId,
        staffId: args.staffId ?? null,
      },
      deps,
    );
  }
  return null;
}
