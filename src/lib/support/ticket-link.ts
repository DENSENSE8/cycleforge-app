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
import { recordOpsEvent } from '@/lib/ops-events';
import { registerShipmentPermissive } from '@/lib/shipping/sync-shipment';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { ZendeskNotConfiguredError } from '@/lib/zendesk';
import {
  buildExternalId,
  clearTicketExternalIdIfMatches,
  getTicketEntity,
  linkTicket,
  unlinkTicket,
} from '@/lib/zendesk-links';
import {
  listTicketLinkCandidates,
  type TicketLinkCandidateMode,
} from '@/lib/zendesk-link-candidates';
import { zendeskTicketUrl } from '@/lib/zendesk-ticket-url';
import {
  pickTicketLinkAnchor,
  upsertSupportTicket,
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
  /** `reference` when picking a ticket to attach an EXTRA shipment to — it stops
   *  the anchor-mode rule from hiding tickets that are already anchored. */
  mode?: TicketLinkCandidateMode;
}) {
  const resolved = await resolveTicketLinkAnchor(args.orgId, args.anchor);
  return listTicketLinkCandidates({
    orgId: args.orgId,
    entityType: resolved.entityType,
    entityId: resolved.entityId,
    query: args.query,
    mode: args.mode,
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

  await recordTicketLinkEvent({
    orgId: args.orgId,
    kind: 'linked',
    entityType: resolved.entityType,
    entityId: resolved.entityId,
    ticketId: ticket.id,
    staffId: args.staffId ?? null,
  });

  return {
    ticketNumber,
    ticketUrl: zendeskTicketUrl(ticket.id),
    subject: ticket.subject ?? null,
    supportTicketId,
    entityType: resolved.entityType,
    entityId: resolved.entityId,
  };
}

/**
 * Append a ticket link/unlink moment to `ops_events` — the OPERATOR-facing
 * timeline spine (`audit_logs` is the admin field-diff spine, and
 * `resolveBrowseSources` drops it for anyone without `admin.view_logs`, so an
 * audit row would be invisible to the very people doing the linking).
 *
 * This is what makes `ticketLinkEventsToTimeline`'s 'unlinked' branch reachable
 * at all: the support hub derived link moments from `ticket_links` ROW STATE,
 * and state cannot express a detach — the row is gone. Only an append-only event
 * can. `ops_events.entity_type` already permits 'shipment' and `event_type` is
 * unconstrained, so this needs no migration.
 *
 * Best-effort by design: a timeline row must never fail a link the operator
 * actually completed. The `ticket_links` row is the record of truth.
 */
async function recordTicketLinkEvent(args: {
  orgId: OrgId;
  kind: 'linked' | 'unlinked';
  entityType: TicketLinkEntityType;
  entityId: number;
  ticketId: number;
  staffId?: number | null;
}): Promise<void> {
  // Only SHIPMENT maps onto an ops_events entity type here; RECEIVING /
  // RECEIVING_LINE link moments still come from row state in the support hub.
  if (args.entityType !== 'SHIPMENT') return;
  try {
    await recordOpsEvent({
      organizationId: args.orgId,
      entityType: 'shipment',
      entityId: args.entityId,
      eventType: args.kind === 'linked' ? 'TICKET_LINKED' : 'TICKET_UNLINKED',
      actorStaffId: args.staffId ?? null,
      payload: { zendeskTicketId: args.ticketId },
    });
  } catch (err) {
    console.warn('[ticket-link] ops_event write failed (non-fatal)', err);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Shipment REFERENCES — the many-STN-per-ticket surface.
//
// An ANCHOR (is_primary) answers "what is this ticket about"; a REFERENCE
// answers "which other shipments does it touch". `linkTicketToAnchor` above owns
// the anchor and deliberately keeps its already-linked-elsewhere conflict guard:
// re-anchoring must stay an explicit act. Adding an extra STN is NOT re-anchoring,
// so it routes through here and never trips that guard.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Not exported: consumers get this shape by inference from
 * {@link listTicketShipmentReferences}. Export it the moment a caller needs to
 * name it (a support-side STN list component will) — an exported-but-unimported
 * type is dead code the knip gate rightly rejects.
 */
interface TicketShipmentReference {
  shipmentId: number;
  trackingNumber: string | null;
  carrier: string | null;
  isPrimary: boolean;
  linkedAt: string;
}

/** Every STN a ticket references, anchor first, then newest. */
export async function listTicketShipmentReferences(args: {
  orgId: OrgId;
  ticketId: number;
}): Promise<TicketShipmentReference[]> {
  const res = await tenantQuery<{
    shipment_id: string;
    tracking_number: string | null;
    carrier: string | null;
    is_primary: boolean;
    created_at: string;
  }>(
    args.orgId,
    `SELECT tl.entity_id AS shipment_id,
            stn.tracking_number_raw        AS tracking_number,
            NULLIF(stn.carrier, 'UNKNOWN') AS carrier,
            tl.is_primary,
            tl.created_at
       FROM ticket_links tl
       JOIN shipping_tracking_numbers stn ON stn.id = tl.entity_id
      WHERE tl.organization_id = $1
        AND tl.zendesk_ticket_id = $2
        AND tl.entity_type = 'SHIPMENT'
      ORDER BY tl.is_primary DESC, tl.created_at DESC`,
    [args.orgId, args.ticketId],
  );
  return res.rows.map((r) => ({
    shipmentId: Number(r.shipment_id),
    trackingNumber: r.tracking_number,
    carrier: r.carrier,
    isPrimary: r.is_primary,
    linkedAt: r.created_at,
  }));
}

/**
 * Reference an STN from a ticket. Accepts a resolved shipment id or a raw
 * tracking number (which mints the STN on demand, as the tracking anchor does).
 *
 * Primary-vs-reference is decided IN SQL rather than by a read-then-write: the
 * row becomes the anchor only when the ticket has none yet, so the first STN on a
 * fresh ticket anchors it and every later one is a reference. Computing it inline
 * keeps the decision inside one statement; if two callers race, the loser trips
 * ux_ticket_links_ticket_primary rather than silently creating a second anchor.
 *
 * Idempotent: re-referencing the same STN is a no-op (natural-key conflict).
 */
export async function addTicketShipmentReference(args: {
  orgId: OrgId;
  ticketId: number;
  shipmentId?: number;
  trackingNumber?: string;
  staffId?: number | null;
}): Promise<{ shipmentId: number; isPrimary: boolean; added: boolean }> {
  let shipmentId = args.shipmentId ?? null;
  if (shipmentId == null) {
    const raw = args.trackingNumber?.trim();
    if (!raw) throw ApiError.badRequest('shipmentId or trackingNumber is required');
    const stn = await registerShipmentPermissive(
      { trackingNumber: raw, sourceSystem: 'support_ticket_link' },
      args.orgId,
    );
    if (!stn) throw ApiError.badRequest(`Invalid tracking number: ${raw}`);
    shipmentId = Number(stn.id);
  }

  // upsertSupportTicket via linkTicket is NOT reused here: that helper writes an
  // anchor. Resolve the registry row directly so a reference still carries
  // support_ticket_id.
  const supportTicket = await upsertSupportTicket({
    orgId: args.orgId,
    provider: 'zendesk',
    externalTicketId: String(args.ticketId),
    staffId: args.staffId ?? null,
  });

  const res = await tenantQuery<{ is_primary: boolean }>(
    args.orgId,
    `INSERT INTO ticket_links
       (organization_id, support_ticket_id, zendesk_ticket_id, entity_type, entity_id,
        is_primary, created_by)
     SELECT $1, $2, $3, 'SHIPMENT', $4,
            NOT EXISTS (
              SELECT 1 FROM ticket_links
               WHERE organization_id = $1 AND zendesk_ticket_id = $3 AND is_primary
            ),
            $5
     ON CONFLICT (organization_id, zendesk_ticket_id, entity_type, entity_id) DO NOTHING
     RETURNING is_primary`,
    [args.orgId, supportTicket.id, args.ticketId, shipmentId, args.staffId ?? null],
  );

  const row = res.rows[0];
  if (row) {
    await recordTicketLinkEvent({
      orgId: args.orgId,
      kind: 'linked',
      entityType: 'SHIPMENT',
      entityId: shipmentId,
      ticketId: args.ticketId,
      staffId: args.staffId ?? null,
    });
    return { shipmentId, isPrimary: row.is_primary, added: true };
  }

  // DO NOTHING fired — the link already existed. Report its current role.
  // No event: nothing changed, and a re-click must not litter the timeline.
  const existing = await tenantQuery<{ is_primary: boolean }>(
    args.orgId,
    `SELECT is_primary FROM ticket_links
      WHERE organization_id = $1 AND zendesk_ticket_id = $2
        AND entity_type = 'SHIPMENT' AND entity_id = $3`,
    [args.orgId, args.ticketId, shipmentId],
  );
  return { shipmentId, isPrimary: existing.rows[0]?.is_primary ?? false, added: false };
}

/**
 * Drop one STN reference from a ticket.
 *
 * When the removed row was the ANCHOR and other rows survive, the oldest
 * survivor is promoted. Without that, a ticket would be left holding references
 * but no primary — and every ticket→entity reader (getTicketEntity,
 * resolveSupportTicketToReceiving, the candidates map) filters on is_primary, so
 * the ticket would read as UNLINKED while still carrying rows. The partial index
 * permits zero primaries, so nothing in the schema would catch it.
 */
export async function removeTicketShipmentReference(args: {
  orgId: OrgId;
  ticketId: number;
  shipmentId: number;
  staffId?: number | null;
}): Promise<{ removed: boolean; promotedShipmentId: number | null }> {
  const result = await withTenantTransaction(args.orgId, async (c) => {
    const del = await c.query<{ is_primary: boolean }>(
      `DELETE FROM ticket_links
        WHERE organization_id = $1 AND zendesk_ticket_id = $2
          AND entity_type = 'SHIPMENT' AND entity_id = $3
        RETURNING is_primary`,
      [args.orgId, args.ticketId, args.shipmentId],
    );
    const removedRow = del.rows[0];
    if (!removedRow) return { removed: false, promotedShipmentId: null };
    if (!removedRow.is_primary) return { removed: true, promotedShipmentId: null };

    const promote = await c.query<{ entity_id: string }>(
      `UPDATE ticket_links SET is_primary = true, updated_at = NOW()
        WHERE id = (
          SELECT id FROM ticket_links
           WHERE organization_id = $1 AND zendesk_ticket_id = $2
           ORDER BY created_at ASC, id ASC
           LIMIT 1
        )
        RETURNING entity_id`,
      [args.orgId, args.ticketId],
    );
    const promoted = promote.rows[0];
    return {
      removed: true,
      promotedShipmentId: promoted ? Number(promoted.entity_id) : null,
    };
  });

  // Emitted AFTER the transaction commits — an event for a rolled-back detach
  // would be a lie, and ops_events is append-only (nothing to compensate with).
  if (result.removed) {
    await recordTicketLinkEvent({
      orgId: args.orgId,
      kind: 'unlinked',
      entityType: 'SHIPMENT',
      entityId: args.shipmentId,
      ticketId: args.ticketId,
      staffId: args.staffId ?? null,
    });
  }
  return result;
}

/** Detach a ticket from the resolved anchor (entity-scoped). */
export async function unlinkTicketFromAnchor(args: {
  orgId: OrgId;
  ticketId: number;
  anchor: TicketLinkAnchorInput;
  staffId?: number | null;
  // Returns the RESOLVED entity too, so the route can audit what was actually
  // detached rather than re-resolving the anchor (or, worse, auditing the ticket
  // id as if it were the entity id).
}): Promise<{ removed: boolean; entityType: TicketLinkEntityType; entityId: number }> {
  const resolved = await resolveTicketLinkAnchor(args.orgId, args.anchor);
  const removed = await unlinkTicket({
    orgId: args.orgId,
    zendeskTicketId: args.ticketId,
    entityType: resolved.entityType,
    entityId: resolved.entityId,
  });

  if (removed) {
    await recordTicketLinkEvent({
      orgId: args.orgId,
      kind: 'unlinked',
      entityType: resolved.entityType,
      entityId: resolved.entityId,
      ticketId: args.ticketId,
      staffId: args.staffId ?? null,
    });
  }

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

  return { removed, entityType: resolved.entityType, entityId: resolved.entityId };
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
      // `AND is_primary` is load-bearing: an STN may now be referenced by MANY
      // tickets (the many-STN-per-ticket feature). Only a ticket ANCHORED to
      // this STN describes the shipment itself and may legitimately be re-anchored
      // onto the carton. Promoting a ticket that merely *references* this STN
      // among several would yank it off the entity it is actually about.
      `SELECT zendesk_ticket_id, support_ticket_id
         FROM ticket_links
        WHERE organization_id = $1
          AND entity_type = 'SHIPMENT'
          AND entity_id = $2
          AND is_primary
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
