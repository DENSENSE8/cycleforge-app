/**
 * Shared waist for linking an existing Zendesk ticket to an internal entity
 * (SHIPMENT / RECEIVING / RECEIVING_LINE). Used by /api/support/tickets/link
 * and the receiving claim-link route.
 */
import { ApiError } from '@/lib/api';
import {
  HelpdeskNotConnectedError,
  requireHelpdeskProvider,
} from '@/lib/integrations/helpdesk';
import { registerShipmentPermissive } from '@/lib/shipping/sync-shipment';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { ZendeskNotConfiguredError } from '@/lib/zendesk';
import {
  buildExternalId,
  clearTicketExternalIdIfMatches,
  getTicketEntity,
  linkTicket,
  unlinkTicket,
} from '@/lib/zendesk-links';
import { listTicketLinkCandidates } from '@/lib/zendesk-link-candidates';
import { zendeskTicketUrl } from '@/lib/zendesk-ticket-url';
import {
  pickTicketLinkAnchor,
  type TicketLinkAnchor,
  type TicketLinkEntityType,
} from '@/lib/support/tickets';

export type TicketLinkAnchorInput =
  | { type: 'receiving'; receivingId: number; lineId?: number | null }
  | { type: 'tracking'; trackingNumber: string }
  | { type: 'shipment'; shipmentId: number }
  | { type: 'order'; orderId: number };

export interface ResolvedTicketLinkAnchor extends TicketLinkAnchor {
  /** Human label for the anchor (tracking last-4, receiving id, …). */
  label: string;
}

async function resolveOrderPrimaryShipment(
  orgId: OrgId,
  orderId: number,
): Promise<{ shipmentId: number; tracking: string | null } | null> {
  const primary = await tenantQuery<{ shipment_id: number; tracking: string | null }>(
    orgId,
    `SELECT sl.shipment_id,
            stn.tracking_number_raw AS tracking
       FROM shipment_links sl
       JOIN shipping_tracking_numbers stn ON stn.id = sl.shipment_id
      WHERE sl.organization_id = $1
        AND sl.owner_type = 'ORDER'
        AND sl.owner_id = $2
      ORDER BY sl.is_primary DESC, sl.id ASC
      LIMIT 1`,
    [orgId, orderId],
  );
  if (primary.rows[0]) {
    return {
      shipmentId: Number(primary.rows[0].shipment_id),
      tracking: primary.rows[0].tracking,
    };
  }
  const fallback = await tenantQuery<{ shipment_id: number | null; tracking: string | null }>(
    orgId,
    `SELECT o.shipment_id,
            stn.tracking_number_raw AS tracking
       FROM orders o
       LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
      WHERE o.organization_id = $1 AND o.id = $2
      LIMIT 1`,
    [orgId, orderId],
  );
  const sid = fallback.rows[0]?.shipment_id;
  if (sid == null) return null;
  return { shipmentId: Number(sid), tracking: fallback.rows[0]?.tracking ?? null };
}

/** Resolve a client anchor input to a ticket_links entity ref. */
export async function resolveTicketLinkAnchor(
  orgId: OrgId,
  input: TicketLinkAnchorInput,
): Promise<ResolvedTicketLinkAnchor> {
  if (input.type === 'receiving') {
    const picked = pickTicketLinkAnchor({
      lineId: input.lineId ?? null,
      receivingId: input.receivingId,
    });
    if (!picked) throw ApiError.badRequest('receivingId is required');
    return {
      ...picked,
      label:
        picked.entityType === 'RECEIVING_LINE'
          ? `line #${picked.entityId}`
          : `carton #${picked.entityId}`,
    };
  }

  if (input.type === 'shipment') {
    const picked = pickTicketLinkAnchor({ shipmentId: input.shipmentId });
    if (!picked) throw ApiError.badRequest('shipmentId is required');
    return { ...picked, label: `shipment #${picked.entityId}` };
  }

  if (input.type === 'tracking') {
    const stn = await registerShipmentPermissive(
      { trackingNumber: input.trackingNumber, sourceSystem: 'support_ticket_link' },
      orgId,
    );
    if (!stn) throw ApiError.badRequest(`Invalid tracking number: ${input.trackingNumber}`);
    return {
      entityType: 'SHIPMENT',
      entityId: Number(stn.id),
      label: input.trackingNumber.trim(),
    };
  }

  // order
  const ship = await resolveOrderPrimaryShipment(orgId, input.orderId);
  if (!ship) {
    throw ApiError.notFound('Order shipment', input.orderId);
  }
  return {
    entityType: 'SHIPMENT',
    entityId: ship.shipmentId,
    label: ship.tracking ?? `shipment #${ship.shipmentId}`,
  };
}

export async function listCandidatesForAnchor(args: {
  orgId: OrgId;
  anchor: TicketLinkAnchorInput;
  query?: string | null;
}) {
  const resolved = await resolveTicketLinkAnchor(args.orgId, args.anchor);
  return listTicketLinkCandidates({
    orgId: args.orgId,
    entityType: resolved.entityType,
    entityId: resolved.entityId,
    query: args.query,
  });
}

export interface LinkTicketToAnchorResult {
  ticketNumber: string;
  ticketUrl: string | null;
  subject: string | null;
  supportTicketId: number;
  entityType: TicketLinkEntityType;
  entityId: number;
}

/** Link an existing Zendesk ticket to the resolved anchor. */
export async function linkTicketToAnchor(args: {
  orgId: OrgId;
  ticketId: number;
  anchor: TicketLinkAnchorInput;
  staffId?: number | null;
}): Promise<LinkTicketToAnchorResult> {
  const resolved = await resolveTicketLinkAnchor(args.orgId, args.anchor);
  const helpdesk = await requireHelpdeskProvider(args.orgId);
  const ticket = await helpdesk.getTicket(args.ticketId);
  if (!ticket) throw ApiError.notFound('Helpdesk ticket', args.ticketId);

  const existing = await getTicketEntity(args.orgId, args.ticketId);
  if (
    existing &&
    !(existing.type === resolved.entityType && existing.id === resolved.entityId)
  ) {
    throw ApiError.conflict(`Ticket #${args.ticketId} is already linked to another item`);
  }

  const { supportTicketId } = await linkTicket({
    orgId: args.orgId,
    zendeskTicketId: ticket.id,
    entityType: resolved.entityType,
    entityId: resolved.entityId,
    staffId: args.staffId ?? null,
  });

  if (!ticket.external_id) {
    try {
      await helpdesk.updateTicket(ticket.id, {
        external_id: buildExternalId(resolved.entityType, resolved.entityId),
      });
    } catch (extErr) {
      console.warn('[ticket-link] external_id backfill failed', extErr);
    }
  }

  // Denormalized display column on receiving records (best-effort).
  const ticketNumber = `#${ticket.id}`;
  try {
    if (resolved.entityType === 'RECEIVING_LINE') {
      await tenantQuery(
        args.orgId,
        `UPDATE receiving_line SET zendesk_ticket = $1 WHERE id = $2 AND organization_id = $3`,
        [ticketNumber, resolved.entityId, args.orgId],
      );
    } else if (resolved.entityType === 'RECEIVING') {
      await tenantQuery(
        args.orgId,
        `UPDATE receiving_carton SET zendesk_ticket = $1 WHERE id = $2 AND organization_id = $3`,
        [ticketNumber, resolved.entityId, args.orgId],
      );
    }
  } catch (colErr) {
    console.warn('[ticket-link] zendesk_ticket column update failed', colErr);
  }

  return {
    ticketNumber,
    ticketUrl: zendeskTicketUrl(ticket.id),
    subject: ticket.subject ?? null,
    supportTicketId,
    entityType: resolved.entityType,
    entityId: resolved.entityId,
  };
}

/** Detach a ticket from the resolved anchor (entity-scoped). */
export async function unlinkTicketFromAnchor(args: {
  orgId: OrgId;
  ticketId: number;
  anchor: TicketLinkAnchorInput;
}): Promise<{ removed: boolean }> {
  const resolved = await resolveTicketLinkAnchor(args.orgId, args.anchor);
  const removed = await unlinkTicket({
    orgId: args.orgId,
    zendeskTicketId: args.ticketId,
    entityType: resolved.entityType,
    entityId: resolved.entityId,
  });

  await clearTicketExternalIdIfMatches({
    orgId: args.orgId,
    zendeskTicketId: args.ticketId,
    entityType: resolved.entityType,
    entityId: resolved.entityId,
  });

  const ticketNumber = `#${args.ticketId}`;
  try {
    if (resolved.entityType === 'RECEIVING_LINE') {
      await tenantQuery(
        args.orgId,
        `UPDATE receiving_line SET zendesk_ticket = NULL WHERE id = $1 AND organization_id = $2 AND zendesk_ticket = $3`,
        [resolved.entityId, args.orgId, ticketNumber],
      );
    } else if (resolved.entityType === 'RECEIVING') {
      await tenantQuery(
        args.orgId,
        `UPDATE receiving_carton SET zendesk_ticket = NULL WHERE id = $1 AND organization_id = $2 AND zendesk_ticket = $3`,
        [resolved.entityId, args.orgId, ticketNumber],
      );
    }
  } catch (colErr) {
    console.warn('[ticket-link] zendesk_ticket column clear failed', colErr);
  }

  return { removed };
}

export function isHelpdeskNotConnected(err: unknown): boolean {
  return err instanceof ZendeskNotConfiguredError || err instanceof HelpdeskNotConnectedError;
}

/**
 * When a carton adopts an STN that already carries a ticket_links SHIPMENT row,
 * promote the primary entity to RECEIVING so unbox resolves the ticket on the
 * carton. Best-effort; never throws.
 */
export async function promoteShipmentTicketToReceiving(args: {
  orgId: OrgId;
  shipmentId: number;
  receivingId: number;
  staffId?: number | null;
}): Promise<boolean> {
  try {
    const existing = await tenantQuery<{
      zendesk_ticket_id: string;
      support_ticket_id: string | null;
    }>(
      args.orgId,
      `SELECT zendesk_ticket_id, support_ticket_id
         FROM ticket_links
        WHERE organization_id = $1
          AND entity_type = 'SHIPMENT'
          AND entity_id = $2
        LIMIT 1`,
      [args.orgId, args.shipmentId],
    );
    const row = existing.rows[0];
    if (!row) return false;
    const zendeskTicketId = Number(row.zendesk_ticket_id);
    if (!Number.isFinite(zendeskTicketId) || zendeskTicketId <= 0) return false;

    await linkTicket({
      orgId: args.orgId,
      zendeskTicketId,
      entityType: 'RECEIVING',
      entityId: args.receivingId,
      staffId: args.staffId ?? null,
    });

    const ticketNumber = `#${zendeskTicketId}`;
    await tenantQuery(
      args.orgId,
      `UPDATE receiving_carton SET zendesk_ticket = $1 WHERE id = $2 AND organization_id = $3 AND zendesk_ticket IS NULL`,
      [ticketNumber, args.receivingId, args.orgId],
    );
    return true;
  } catch (err) {
    console.warn('[ticket-link] promoteShipmentTicketToReceiving failed', err);
    return false;
  }
}
