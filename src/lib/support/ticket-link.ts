/**
 * Shared waist for linking an existing Zendesk ticket to an internal entity
 * (SHIPMENT / RECEIVING / RECEIVING_LINE / SERIAL_UNIT / REPAIR / ORDER). Used by
 * /api/support/tickets/link and the receiving claim-link route.
 */
import { ApiError } from '@/lib/api';
import {
  HelpdeskNotConnectedError,
  requireHelpdeskProvider,
} from '@/lib/integrations/helpdesk';
import { recordOpsEvent } from '@/lib/ops-events';
import { unlinkReceivingClaimPhotosFromTicket } from '@/lib/photos/claim-link';
import { listAllReceivingPhotoIds } from '@/lib/photos/queries/receiving-list';
import { registerShipmentPermissive } from '@/lib/shipping/sync-shipment';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { ZendeskNotConfiguredError } from '@/lib/zendesk';
import { linkLibraryPhotosToTicket } from '@/lib/zendesk-attachments';
import {
  buildExternalId,
  clearTicketExternalIdIfMatches,
  getTicketEntity,
  linkSupportTicketEntity,
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
import {
  pairTicketShipmentFromEntity as pairTicketShipmentFromEntityCore,
  pairTicketShipmentFromReceiving as pairTicketShipmentFromReceivingCore,
  unpairTicketShipmentFromReceiving as unpairTicketShipmentFromReceivingCore,
  type PairTicketShipmentFromEntityDeps,
  type PairTicketShipmentFromReceivingDeps,
  type UnpairTicketShipmentFromReceivingDeps,
} from '@/lib/support/ticket-shipment-pair';

export type TicketLinkAnchorInput =
  | { type: 'serialUnit'; serialUnitId: number }
  | { type: 'receiving'; receivingId: number; lineId?: number | null }
  | { type: 'tracking'; trackingNumber: string }
  | { type: 'shipment'; shipmentId: number }
  | { type: 'order'; orderId: number }
  /** A repair work record is the anchor for a counter-service ticket (plan D6). */
  | { type: 'repair'; repairId: number };

interface ResolvedTicketLinkAnchor extends TicketLinkAnchor {
  /** Human label for the anchor (tracking last-8, receiving id, …). */
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
async function resolveTicketLinkAnchor(
  orgId: OrgId,
  input: TicketLinkAnchorInput,
): Promise<ResolvedTicketLinkAnchor> {
  if (input.type === 'serialUnit') {
    const unit = await tenantQuery<{ unit_uid: string | null; serial_number: string | null }>(
      orgId,
      `SELECT unit_uid, serial_number
         FROM serial_units
        WHERE organization_id = $1 AND id = $2
        LIMIT 1`,
      [orgId, input.serialUnitId],
    );
    if (!unit.rows[0]) throw ApiError.notFound('Serial unit', input.serialUnitId);
    const label = unit.rows[0].unit_uid?.trim() || unit.rows[0].serial_number?.trim();
    return {
      entityType: 'SERIAL_UNIT',
      entityId: input.serialUnitId,
      label: label || `unit #${input.serialUnitId}`,
    };
  }

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

  if (input.type === 'repair') {
    const picked = pickTicketLinkAnchor({ repairId: input.repairId });
    if (!picked) throw ApiError.badRequest('repairId is required');
    // Label with the operator-facing RS number when it resolves; the bare id is
    // a DB key nobody at the counter can read off a work order.
    const rs = await tenantQuery<{ ticket_number: string | null }>(
      orgId,
      `SELECT ticket_number FROM repair_service
        WHERE id = $1 AND organization_id = $2
        LIMIT 1`,
      [input.repairId, orgId],
    );
    if (rs.rows.length === 0) {
      throw ApiError.notFound('Repair', input.repairId);
    }
    return {
      ...picked,
      label: rs.rows[0].ticket_number?.trim() || `repair #${picked.entityId}`,
    };
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

  // order — prefer the primary STN when the outbound loop has one; otherwise
  // anchor directly on ORDER so walk-in / phone Ecwid orders without tracking
  // still get a durable ticket_links row (and Timeline can seed the loop).
  const ship = await resolveOrderPrimaryShipment(orgId, input.orderId);
  if (ship) {
    return {
      entityType: 'SHIPMENT',
      entityId: ship.shipmentId,
      label: ship.tracking ?? `shipment #${ship.shipmentId}`,
    };
  }
  const orderRow = await tenantQuery<{ order_id: string | null }>(
    orgId,
    `SELECT order_id FROM orders
      WHERE organization_id = $1 AND id = $2
      LIMIT 1`,
    [orgId, input.orderId],
  );
  if (!orderRow.rows[0]) {
    throw ApiError.notFound('Order', input.orderId);
  }
  const orderLabel = orderRow.rows[0].order_id?.trim() || `order #${input.orderId}`;
  return {
    entityType: 'ORDER',
    entityId: input.orderId,
    label: orderLabel.startsWith('#') ? orderLabel : `Order #${orderLabel}`,
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

export interface AnchorLinkedTicket {
  supportTicketId: number;
  /** Helpdesk ticket id — the unlink key; null for an internal ticket. */
  ticketId: number | null;
  subject: string | null;
  status: string | null;
}

/** Tickets currently linked to the resolved anchor, primary first. Reads ticket_links only — no helpdesk call. */
export async function listTicketsLinkedToAnchor(args: {
  orgId: OrgId;
  anchor: TicketLinkAnchorInput;
}): Promise<AnchorLinkedTicket[]> {
  const resolved = await resolveTicketLinkAnchor(args.orgId, args.anchor);
  const res = await tenantQuery<{
    support_ticket_id: string;
    zendesk_ticket_id: string | null;
    subject_cache: string | null;
    status_cache: string | null;
  }>(
    args.orgId,
    `SELECT tl.support_ticket_id, tl.zendesk_ticket_id, st.subject_cache, st.status_cache
       FROM ticket_links tl
       JOIN support_tickets st ON st.id = tl.support_ticket_id AND st.organization_id = tl.organization_id
      WHERE tl.organization_id = $1 AND tl.entity_type = $2 AND tl.entity_id = $3
      ORDER BY tl.is_primary DESC, tl.created_at DESC`,
    [args.orgId, resolved.entityType, resolved.entityId],
  );
  return res.rows.map((row) => ({
    supportTicketId: Number(row.support_ticket_id),
    ticketId: row.zendesk_ticket_id == null ? null : Number(row.zendesk_ticket_id),
    subject: row.subject_cache,
    status: row.status_cache,
  }));
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

  // Pair the carton's STN as a ticket_links reference whenever the anchor is a
  // receiving carton/line. Best-effort — primary RECEIVING link already succeeded.
  if (args.anchor.type === 'receiving') {
    try {
      await pairTicketShipmentFromReceiving({
        orgId: args.orgId,
        ticketId: ticket.id,
        receivingId: args.anchor.receivingId,
        staffId: args.staffId ?? null,
      });
    } catch (pairErr) {
      console.warn('[ticket-link] STN pair after receiving anchor failed', pairErr);
    }

    // Dual-link existing carton photos as claim evidence so Media Library
    // claims search / NAS ticket folders resolve without waiting for a re-upload.
    try {
      const photoIds = await listAllReceivingPhotoIds(args.orgId, args.anchor.receivingId);
      if (photoIds.length > 0) {
        await linkLibraryPhotosToTicket(args.orgId, ticket.id, photoIds);
      }
    } catch (photoErr) {
      console.warn('[ticket-link] claim photo backfill failed', photoErr);
    }
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

/** Append a ticket link/unlink moment to `ops_events` — the OPERATOR-facing timeline spine (`audit_logs` is the admin field-diff spine, and… */
/** Map ticket_links entity types that emit append-only link moments onto
 *  `ops_events.entity_type`. RECEIVING / RECEIVING_LINE stay on row state in
 *  the support hub (history already lives on those rows). */
const TICKET_LINK_OPS_ENTITY: Partial<
  Record<TicketLinkEntityType, 'shipment' | 'order' | 'repair'>
> = {
  SHIPMENT: 'shipment',
  ORDER: 'order',
  REPAIR: 'repair',
};

async function recordTicketLinkEvent(args: {
  orgId: OrgId;
  kind: 'linked' | 'unlinked';
  entityType: TicketLinkEntityType;
  entityId: number;
  ticketId: number;
  staffId?: number | null;
}): Promise<void> {
  const opsEntityType = TICKET_LINK_OPS_ENTITY[args.entityType];
  if (!opsEntityType) return;
  try {
    await recordOpsEvent({
      organizationId: args.orgId,
      entityType: opsEntityType,
      entityId: args.entityId,
      eventType: args.kind === 'linked' ? 'TICKET_LINKED' : 'TICKET_UNLINKED',
      actorStaffId: args.staffId ?? null,
      payload: { zendeskTicketId: args.ticketId },
    });
  } catch (err) {
    console.warn('[ticket-link] ops_event write failed (non-fatal)', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────── Shipment REFERENCES — the many-STN-per-ticket surface.

/** Not exported: */
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
 * Injectable seam for {@link addTicketShipmentReference} so the re-keyed SQL is
 * unit-testable DB-free (mirrors the `Deps` pattern in backend-patterns.md).
 */
export interface AddTicketShipmentReferenceDeps {
  registerShipment: (trackingNumber: string, orgId: OrgId) => Promise<{ id: number } | null>;
  resolveSupportTicket: (
    zendeskTicketId: number,
    orgId: OrgId,
    staffId: number | null,
  ) => Promise<{ id: number }>;
  runQuery: (
    orgId: OrgId,
    sql: string,
    params: unknown[],
  ) => Promise<{ rows: Array<{ is_primary: boolean }> }>;
  recordLinkEvent: (args: {
    orgId: OrgId;
    entityId: number;
    ticketId: number;
    staffId: number | null;
  }) => Promise<void>;
}

const defaultAddTicketShipmentReferenceDeps: AddTicketShipmentReferenceDeps = {
  registerShipment: (trackingNumber, orgId) =>
    registerShipmentPermissive({ trackingNumber, sourceSystem: 'support_ticket_link' }, orgId),
  resolveSupportTicket: (zendeskTicketId, orgId, staffId) =>
    upsertSupportTicket({
      orgId,
      provider: 'zendesk',
      externalTicketId: String(zendeskTicketId),
      staffId,
    }),
  runQuery: (orgId, sql, params) => tenantQuery<{ is_primary: boolean }>(orgId, sql, params),
  recordLinkEvent: ({ orgId, entityId, ticketId, staffId }) =>
    recordTicketLinkEvent({
      orgId,
      kind: 'linked',
      entityType: 'SHIPMENT',
      entityId,
      ticketId,
      staffId,
    }),
};

/** Reference an STN from a ticket. */
export async function addTicketShipmentReference(
  args: {
    orgId: OrgId;
    ticketId: number;
    shipmentId?: number;
    trackingNumber?: string;
    staffId?: number | null;
  },
  deps: AddTicketShipmentReferenceDeps = defaultAddTicketShipmentReferenceDeps,
): Promise<{ shipmentId: number; isPrimary: boolean; added: boolean }> {
  let shipmentId = args.shipmentId ?? null;
  if (shipmentId == null) {
    const raw = args.trackingNumber?.trim();
    if (!raw) throw ApiError.badRequest('shipmentId or trackingNumber is required');
    const stn = await deps.registerShipment(raw, args.orgId);
    if (!stn) throw ApiError.badRequest(`Invalid tracking number: ${raw}`);
    shipmentId = Number(stn.id);
  }

  // upsertSupportTicket via linkTicket is NOT reused here:
  const supportTicket = await deps.resolveSupportTicket(
    args.ticketId,
    args.orgId,
    args.staffId ?? null,
  );

  const res = await deps.runQuery(
    args.orgId,
    `INSERT INTO ticket_links
       (organization_id, support_ticket_id, zendesk_ticket_id, entity_type, entity_id,
        is_primary, created_by)
     SELECT $1, $2, $3, 'SHIPMENT', $4,
            NOT EXISTS (
              SELECT 1 FROM ticket_links
               WHERE organization_id = $1 AND support_ticket_id = $2 AND is_primary
            ),
            $5
     ON CONFLICT (organization_id, support_ticket_id, entity_type, entity_id) DO NOTHING
     RETURNING is_primary`,
    [args.orgId, supportTicket.id, args.ticketId, shipmentId, args.staffId ?? null],
  );

  const row = res.rows[0];
  if (row) {
    await deps.recordLinkEvent({
      orgId: args.orgId,
      entityId: shipmentId,
      ticketId: args.ticketId,
      staffId: args.staffId ?? null,
    });
    return { shipmentId, isPrimary: row.is_primary, added: true };
  }

  // DO NOTHING fired — the link already existed. Report its current role.
  // No event: nothing changed, and a re-click must not litter the timeline.
  const existing = await deps.runQuery(
    args.orgId,
    `SELECT is_primary FROM ticket_links
      WHERE organization_id = $1 AND support_ticket_id = $2
        AND entity_type = 'SHIPMENT' AND entity_id = $3`,
    [args.orgId, supportTicket.id, shipmentId],
  );
  return { shipmentId, isPrimary: existing.rows[0]?.is_primary ?? false, added: false };
}

/** After anchoring a ticket to a receiving carton/line, also reference the carton's STN on `ticket_links` (non-primary when RECEIVING is… */
const defaultPairFromReceivingDeps: PairTicketShipmentFromReceivingDeps = {
  lookupCartonShipmentId: async (orgId, receivingId) => {
    const res = await tenantQuery<{ shipment_id: number | null }>(
      orgId,
      `SELECT shipment_id
         FROM receiving_carton
        WHERE id = $1 AND organization_id = $2
        LIMIT 1`,
      [receivingId, orgId],
    );
    const shipmentId = res.rows[0]?.shipment_id;
    return shipmentId == null ? null : Number(shipmentId);
  },
  addReference: (args) => addTicketShipmentReference(args),
};

export async function pairTicketShipmentFromReceiving(
  args: {
    orgId: OrgId;
    ticketId: number;
    receivingId: number;
    staffId?: number | null;
  },
  deps: PairTicketShipmentFromReceivingDeps = defaultPairFromReceivingDeps,
): Promise<{ shipmentId: number; isPrimary: boolean; added: boolean } | null> {
  return pairTicketShipmentFromReceivingCore(args, deps);
}

const defaultUnpairFromReceivingDeps: UnpairTicketShipmentFromReceivingDeps = {
  lookupCartonShipmentId: defaultPairFromReceivingDeps.lookupCartonShipmentId,
  removeReference: (args) => removeTicketShipmentReference(args),
};

async function unpairTicketShipmentFromReceiving(
  args: {
    orgId: OrgId;
    ticketId: number;
    receivingId: number;
    staffId?: number | null;
  },
  deps: UnpairTicketShipmentFromReceivingDeps = defaultUnpairFromReceivingDeps,
): Promise<{
  shipmentId: number;
  removed: boolean;
  promotedShipmentId: number | null;
} | null> {
  return unpairTicketShipmentFromReceivingCore(args, deps);
}

/**
 * Pair a ticket to a known STN (by id or tracking). Prefer
 * {@link pairTicketShipmentFromReceiving} when the carton is in hand.
 */
export async function pairTicketShipmentIfKnown(args: {
  orgId: OrgId;
  ticketId: number;
  shipmentId?: number | null;
  trackingNumber?: string | null;
  staffId?: number | null;
}): Promise<{ shipmentId: number; isPrimary: boolean; added: boolean } | null> {
  if (args.shipmentId != null && Number.isFinite(args.shipmentId) && args.shipmentId > 0) {
    return addTicketShipmentReference({
      orgId: args.orgId,
      ticketId: args.ticketId,
      shipmentId: Number(args.shipmentId),
      staffId: args.staffId ?? null,
    });
  }
  const tracking = args.trackingNumber?.trim();
  if (!tracking) return null;
  return addTicketShipmentReference({
    orgId: args.orgId,
    ticketId: args.ticketId,
    trackingNumber: tracking,
    staffId: args.staffId ?? null,
  });
}

/**
 * When a ticket was just anchored to RECEIVING / RECEIVING_LINE / SHIPMENT,
 * ensure the STN is on `ticket_links`. SHIPMENT anchors are already the STN
 * primary — this is an idempotent re-reference for those.
 */
const defaultPairFromEntityDeps: PairTicketShipmentFromEntityDeps = {
  ...defaultPairFromReceivingDeps,
  lookupLineReceivingId: async (orgId, lineId) => {
    const res = await tenantQuery<{ receiving_id: number | null }>(
      orgId,
      `SELECT receiving_id
         FROM receiving_line
        WHERE id = $1 AND organization_id = $2
        LIMIT 1`,
      [lineId, orgId],
    );
    const receivingId = res.rows[0]?.receiving_id;
    return receivingId == null ? null : Number(receivingId);
  },
};

export async function pairTicketShipmentFromEntity(
  args: {
    orgId: OrgId;
    ticketId: number;
    entityType: string;
    entityId: number;
    staffId?: number | null;
  },
  deps: PairTicketShipmentFromEntityDeps = defaultPairFromEntityDeps,
): Promise<{ shipmentId: number; isPrimary: boolean; added: boolean } | null> {
  return pairTicketShipmentFromEntityCore(args, deps);
}

/** Drop one STN reference from a ticket. */
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
}): Promise<{
  removed: boolean;
  entityType: TicketLinkEntityType;
  entityId: number;
  /** Set when the carton's tracking (STN) reference could not be cleared — the ticket_links RECEIVING/RECEIVING_LINE row is gone, but a stale… */
  shipmentUnpairWarning: string | null;
}> {
  let resolved = await resolveTicketLinkAnchor(args.orgId, args.anchor);
  // Target the entity ACTUALLY linked to this ticket, not a freshly re-derived guess.
  if (args.anchor.type === 'receiving') {
    const actual = await getTicketEntity(args.orgId, args.ticketId);
    if (actual && (actual.type === 'RECEIVING' || actual.type === 'RECEIVING_LINE')) {
      resolved = { entityType: actual.type, entityId: actual.id, label: resolved.label };
    }
  } else if (args.anchor.type === 'order') {
    const actual = await getTicketEntity(args.orgId, args.ticketId);
    if (actual && (actual.type === 'ORDER' || actual.type === 'SHIPMENT')) {
      resolved = {
        entityType: actual.type as 'ORDER' | 'SHIPMENT',
        entityId: actual.id,
        label: resolved.label,
      };
    }
  }
  let removed = await unlinkTicket({
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

  // Link always pairs the carton's STN; unlink must reverse that or the
  // package chip keeps resolving via ticketFromShipmentLink.
  let shipmentUnpairWarning: string | null = null;
  if (args.anchor.type === 'receiving') {
    try {
      const unpaired = await unpairTicketShipmentFromReceiving({
        orgId: args.orgId,
        ticketId: args.ticketId,
        receivingId: args.anchor.receivingId,
        staffId: args.staffId ?? null,
      });
      if (unpaired?.removed) removed = true;
    } catch (unpairErr) {
      console.warn('[ticket-link] STN unpair after receiving unlink failed', unpairErr);
      shipmentUnpairWarning =
        'Ticket unlinked, but the tracking-number reference could not be cleared — it may still show as linked there.';
    }

    // Claim photos keep a ZENDESK_TICKET dual-link for media-library grouping.
    // Clear those too — otherwise getPrimarySupportTicketForReceiving's photo
    // fallback resurrects the carton ticket chip after ticket_links are gone.
    try {
      const photoClear = await unlinkReceivingClaimPhotosFromTicket({
        orgId: args.orgId,
        ticketId: args.ticketId,
        receivingId: args.anchor.receivingId,
        lineId: args.anchor.lineId ?? null,
      });
      if (photoClear.cleared > 0) removed = true;
    } catch (photoErr) {
      console.warn('[ticket-link] claim-photo ticket unlink failed', photoErr);
    }
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
      // Carton display column may still hold the ticket when the primary was
      // line-scoped — clear the package too.
      if (args.anchor.type === 'receiving') {
        await tenantQuery(
          args.orgId,
          `UPDATE receiving_carton SET zendesk_ticket = NULL
            WHERE id = $1 AND organization_id = $2 AND zendesk_ticket = $3`,
          [args.anchor.receivingId, args.orgId, ticketNumber],
        );
      }
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

  return {
    removed,
    entityType: resolved.entityType,
    entityId: resolved.entityId,
    shipmentUnpairWarning,
  };
}

export function isHelpdeskNotConnected(err: unknown): boolean {
  return err instanceof ZendeskNotConfiguredError || err instanceof HelpdeskNotConnectedError;
}

/**
 * Injectable seam for {@link promoteShipmentTicketToReceiving} — testable DB-free.
 */
export interface PromoteShipmentTicketDeps {
  runQuery: (
    orgId: OrgId,
    sql: string,
    params: unknown[],
  ) => Promise<{
    rows: Array<{ zendesk_ticket_id: string | null; support_ticket_id: string | null }>;
  }>;
  linkEntity: typeof linkSupportTicketEntity;
  updateReceivingTicketColumn: (
    orgId: OrgId,
    receivingId: number,
    ticketNumber: string,
  ) => Promise<void>;
}

const defaultPromoteShipmentTicketDeps: PromoteShipmentTicketDeps = {
  runQuery: (orgId, sql, params) =>
    tenantQuery<{ zendesk_ticket_id: string | null; support_ticket_id: string | null }>(
      orgId,
      sql,
      params,
    ),
  linkEntity: linkSupportTicketEntity,
  updateReceivingTicketColumn: async (orgId, receivingId, ticketNumber) => {
    await tenantQuery(
      orgId,
      `UPDATE receiving_carton SET zendesk_ticket = $1 WHERE id = $2 AND organization_id = $3 AND zendesk_ticket IS NULL`,
      [ticketNumber, receivingId, orgId],
    );
  },
};

/** When a carton adopts an STN that already carries a ticket_links SHIPMENT row, promote the primary entity to RECEIVING so unbox resolves… */
export async function promoteShipmentTicketToReceiving(
  args: {
    orgId: OrgId;
    shipmentId: number;
    receivingId: number;
    staffId?: number | null;
  },
  deps: PromoteShipmentTicketDeps = defaultPromoteShipmentTicketDeps,
): Promise<boolean> {
  try {
    const existing = await deps.runQuery(
      args.orgId,
      // `AND is_primary` is load-bearing:
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

    const supportTicketId = row.support_ticket_id != null ? Number(row.support_ticket_id) : NaN;
    if (!Number.isFinite(supportTicketId) || supportTicketId <= 0) return false;
    const zendeskTicketId = row.zendesk_ticket_id != null ? Number(row.zendesk_ticket_id) : NaN;
    const providerId =
      Number.isFinite(zendeskTicketId) && zendeskTicketId > 0 ? zendeskTicketId : null;

    await deps.linkEntity({
      orgId: args.orgId,
      supportTicketId,
      zendeskTicketId: providerId,
      entityType: 'RECEIVING',
      entityId: args.receivingId,
      staffId: args.staffId ?? null,
    });

    // Denormalized display cache: prefer the provider id when present, else the
    // internal registry id (dual-# is resolved at the UI layer in Phase 3).
    await deps.updateReceivingTicketColumn(
      args.orgId,
      args.receivingId,
      `#${providerId ?? supportTicketId}`,
    );
    return true;
  } catch (err) {
    console.warn('[ticket-link] promoteShipmentTicketToReceiving failed', err);
    return false;
  }
}
