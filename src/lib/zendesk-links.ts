/**
 * Zendesk ticket ↔ internal entity linking + Blob-photo resolution.
 *
 * Photos for a ticket live in OUR Vercel Blob (the `photos` table), not as
 * Zendesk attachments. To show them we resolve the ticket's internal entity,
 * then fetch that entity's photos. See migration 2026-06-01_ticket_links.sql.
 */
import type { PoolClient } from 'pg';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import { getTicket, updateTicket } from './zendesk';
import { upsertSupportTicket } from '@/lib/support/tickets';
import { photoContentUrl } from '@/lib/photos/display-url';
import { listPhotosForEntity } from '@/lib/photos/service';
import type { PhotoEntityType } from '@/lib/photos/types';

export interface TicketEntityRef {
  type: string;
  id: number;
}

export interface ResolvedTicketEntity extends TicketEntityRef {
  source: 'ticket_links' | 'external_id' | 'unfound_overlay';
}

/** Build a Zendesk `external_id`, e.g. ('RECEIVING_LINE', 1234) → "receiving_line:1234". */
export function buildExternalId(type: string, id: number | string): string {
  return `${String(type).toLowerCase()}:${id}`;
}

/** Parse a Zendesk `external_id` back into an entity ref, or null if it isn't ours. */
export function parseExternalId(value: string | null | undefined): TicketEntityRef | null {
  if (!value) return null;
  const m = /^([a-z_]+):(\d+)$/i.exec(value.trim());
  if (!m) return null;
  return { type: m[1].toUpperCase(), id: Number(m[2]) };
}

/** Minimal tenant-tx client — the query surface these writers touch. */
type TxClient = Pick<PoolClient, 'query'>;

export interface LinkSupportTicketEntityDeps {
  /**
   * Run the demote + upsert in ONE tenant transaction. Defaults to
   * `withTenantTransaction`; injected by unit tests to capture the SQL DB-free.
   */
  runInTenantTx: <T>(orgId: string, fn: (c: TxClient) => Promise<T>) => Promise<T>;
}

const defaultLinkSupportTicketEntityDeps: LinkSupportTicketEntityDeps = {
  runInTenantTx: (orgId, fn) => withTenantTransaction(orgId, (c) => fn(c)),
};

/**
 * Canonical entity-link writer — the ONE place a support ticket's PRIMARY entity
 * link (its anchor) is written, provider-agnostic. Both the Zendesk path
 * ({@link linkTicket}) and the internal-escalation path (threads/escalate.ts)
 * compose this rather than forking a second link writer.
 *
 * Keyed on `support_ticket_id` (2026-07-21 re-key), so it works for INTERNAL
 * tickets (whose `zendesk_ticket_id` is NULL) as well as Zendesk ones. The
 * ON CONFLICT arbiter is `ux_ticket_links_support_entity`; it is safe to name
 * that arbiter while the legacy zendesk-led uniques still exist because they are
 * equivalent (1:1) for Zendesk rows — an equivalent conflict resolves on the same
 * row — and internal rows only ever conflict on the support-led index.
 *
 * REQUIRES the 2026-07-21 expand migration to be applied (support-led indexes +
 * nullable zendesk_ticket_id). Do not deploy this ahead of that migration.
 *
 * Handles all three cases: fresh anchor (insert), re-anchor to a different entity
 * (demote + insert), and promote an existing reference row (conflict → anchor).
 */
export async function linkSupportTicketEntity(args: {
  orgId: string;
  supportTicketId: number;
  /** Provider cache for Zendesk tickets; NULL for internal. */
  zendeskTicketId?: number | null;
  entityType: string;
  entityId: number;
  staffId?: number | null;
}, deps: LinkSupportTicketEntityDeps = defaultLinkSupportTicketEntityDeps): Promise<void> {
  await deps.runInTenantTx(args.orgId, async (c) => {
    // Demote whatever else held this ticket's anchor, so ux_ticket_links_support_anchor
    // can never see two anchors mid-statement. Keyed on support_ticket_id so it
    // covers internal tickets too. (is_primary follows link_role via the DB sync
    // trigger; we set both explicitly and consistently.)
    await c.query(
      `UPDATE ticket_links
          SET is_primary = false, link_role = 'reference', updated_at = NOW()
        WHERE organization_id = $1
          AND support_ticket_id = $2
          AND link_role = 'anchor'
          AND NOT (entity_type = $3 AND entity_id = $4)`,
      [args.orgId, args.supportTicketId, args.entityType, args.entityId],
    );
    await c.query(
      `INSERT INTO ticket_links
         (organization_id, support_ticket_id, zendesk_ticket_id, entity_type, entity_id,
          is_primary, link_role, created_by)
       VALUES ($1, $2, $3, $4, $5, true, 'anchor', $6)
       ON CONFLICT (organization_id, support_ticket_id, entity_type, entity_id) DO UPDATE
         SET is_primary        = true,
             link_role         = 'anchor',
             zendesk_ticket_id = COALESCE(EXCLUDED.zendesk_ticket_id, ticket_links.zendesk_ticket_id),
             updated_at        = NOW()`,
      [
        args.orgId,
        args.supportTicketId,
        args.zendeskTicketId ?? null,
        args.entityType,
        args.entityId,
        args.staffId ?? null,
      ],
    );
    return null;
  });
}

/**
 * Upsert a ZENDESK ticket's PRIMARY entity link (its anchor). Best-effort callers
 * should wrap in try/catch. Thin provider wrapper: resolve/mint the zendesk
 * `support_tickets` row, then delegate to {@link linkSupportTicketEntity}.
 */
export async function linkTicket(args: {
  orgId: string;
  zendeskTicketId: number;
  entityType: string;
  entityId: number;
  staffId?: number | null;
}): Promise<{ supportTicketId: number }> {
  const supportTicket = await upsertSupportTicket({
    orgId: args.orgId,
    provider: 'zendesk',
    externalTicketId: String(args.zendeskTicketId),
    staffId: args.staffId ?? null,
  });
  await linkSupportTicketEntity({
    orgId: args.orgId,
    supportTicketId: supportTicket.id,
    zendeskTicketId: args.zendeskTicketId,
    entityType: args.entityType,
    entityId: args.entityId,
    staffId: args.staffId ?? null,
  });
  return { supportTicketId: supportTicket.id };
}

/**
 * Link a ticket to a shipment (STN id) AS ITS PRIMARY ANCHOR, so cartons
 * anchored to that tracking number resolve the ticket via receiving.shipment_id.
 * Skips when the ticket already has a primary (never steals an anchored ticket).
 *
 * The guard is a `WHERE NOT EXISTS` rather than `ON CONFLICT (org, ticket)
 * DO NOTHING` because that inference target no longer exists on its own: the
 * primary index is partial. Keeping the ON CONFLICT on the support-led natural
 * key (2026-07-21 re-key) means a ticket that already references this STN as a
 * non-primary row gets PROMOTED instead of erroring on
 * ux_ticket_links_support_entity.
 *
 * NOTE: this is the anchor writer. Adding an extra STN to a ticket that already
 * has an anchor is a *reference* link — see addTicketShipmentReference.
 */
export async function linkTicketToShipment(args: {
  orgId: string;
  zendeskTicketId: number;
  shipmentId: number;
  staffId?: number | null;
}): Promise<{ linked: boolean; supportTicketId: number }> {
  const supportTicket = await upsertSupportTicket({
    orgId: args.orgId,
    provider: 'zendesk',
    externalTicketId: String(args.zendeskTicketId),
    staffId: args.staffId ?? null,
  });
  const res = await tenantQuery(
    args.orgId,
    `INSERT INTO ticket_links
       (organization_id, support_ticket_id, zendesk_ticket_id, entity_type, entity_id,
        is_primary, created_by)
     SELECT $1, $2, $3, 'SHIPMENT', $4, true, $5
      WHERE NOT EXISTS (
        SELECT 1 FROM ticket_links
         WHERE organization_id = $1 AND support_ticket_id = $2 AND is_primary
      )
     ON CONFLICT (organization_id, support_ticket_id, entity_type, entity_id) DO UPDATE
       SET is_primary        = true,
           zendesk_ticket_id = COALESCE(EXCLUDED.zendesk_ticket_id, ticket_links.zendesk_ticket_id),
           updated_at        = NOW()`,
    [
      args.orgId,
      supportTicket.id,
      args.zendeskTicketId,
      args.shipmentId,
      args.staffId ?? null,
    ],
  );
  return { linked: (res.rowCount ?? 0) > 0, supportTicketId: supportTicket.id };
}

/**
 * Remove a ticket → entity link. Only deletes the row when it still points at
 * the given entity, so a stale unlink can't detach a ticket that was since
 * re-linked elsewhere. Returns true when a row was removed.
 */
export async function unlinkTicket(args: {
  orgId: string;
  zendeskTicketId: number;
  entityType: string;
  entityId: number;
}): Promise<boolean> {
  const res = await tenantQuery(
    args.orgId,
    `DELETE FROM ticket_links
      WHERE organization_id = $1
        AND zendesk_ticket_id = $2
        AND entity_type = $3
        AND entity_id = $4`,
    [args.orgId, args.zendeskTicketId, args.entityType, args.entityId],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Clear a Zendesk ticket's `external_id` — but ONLY when it still resolves to
 * the given entity. Called on unlink (receiving + warranty) so a detached
 * ticket can't be silently re-attached to the same entity via the external_id
 * fallback in {@link getTicketEntity}. Best-effort: never throws — the
 * `ticket_links` delete is the authoritative detach, this is the clean-up.
 * Returns true when an external_id was cleared.
 */
export async function clearTicketExternalIdIfMatches(args: {
  orgId: string;
  zendeskTicketId: number;
  entityType: string;
  entityId: number;
}): Promise<boolean> {
  try {
    const ticket = await getTicket(args.zendeskTicketId, args.orgId);
    const parsed = parseExternalId(ticket?.external_id as string | undefined);
    if (parsed && parsed.type === args.entityType && parsed.id === args.entityId) {
      await updateTicket(args.zendeskTicketId, { external_id: null }, args.orgId);
      return true;
    }
  } catch (err) {
    console.warn('[zendesk-links] external_id clear failed', err);
  }
  return false;
}

/**
 * Resolve which internal entity a Zendesk ticket belongs to, trying in order:
 *   1. ticket_links table  2. the ticket's external_id  3. unfound_overlay.
 * Returns null when no link is known (e.g. inbound/Zendesk-native tickets).
 */
export async function getTicketEntity(
  orgId: string,
  zendeskTicketId: number,
): Promise<ResolvedTicketEntity | null> {
  // 1. ticket_links (cheapest, authoritative)
  // `AND is_primary` is load-bearing since ticket_links became many-per-ticket:
  // a ticket may now hold extra reference rows (e.g. additional STNs), and the
  // bare LIMIT 1 would return an arbitrary one of them as "the" entity.
  // ux_ticket_links_ticket_primary guarantees at most one primary per ticket.
  const links = await tenantQuery<{ entity_type: string; entity_id: string }>(
    orgId,
    `SELECT entity_type, entity_id FROM ticket_links
      WHERE organization_id = $1 AND zendesk_ticket_id = $2 AND is_primary LIMIT 1`,
    [orgId, zendeskTicketId],
  );
  if (links.rows[0]) {
    return {
      type: links.rows[0].entity_type,
      id: Number(links.rows[0].entity_id),
      source: 'ticket_links',
    };
  }

  // 2. external_id off the live ticket (covers tickets created with it but not yet linked)
  const ticket = await getTicket(zendeskTicketId, orgId);
  const parsed = parseExternalId(ticket?.external_id as string | undefined);
  if (parsed) return { ...parsed, source: 'external_id' };

  // 3. unfound_overlay — stores zendesk_ticket_id as text ("1234" or "#1234")
  const ov = await tenantQuery<{ source_kind: string; source_id: string }>(
    orgId,
    `SELECT source_kind, source_id FROM unfound_overlay
      WHERE organization_id = $1
        AND zendesk_ticket_id IN ($2, $3) LIMIT 1`,
    [orgId, String(zendeskTicketId), `#${zendeskTicketId}`],
  );
  const row = ov.rows[0];
  if (row && row.source_kind === 'unmatched_receiving' && /^\d+$/.test(row.source_id)) {
    // unmatched_receiving.source_id is a receiving.id → photo-bearing RECEIVING entity
    return { type: 'RECEIVING', id: Number(row.source_id), source: 'unfound_overlay' };
  }

  return null;
}

export interface EntityPhoto {
  id: number;
  url: string;
  caption: string | null;
  takenByStaffId: number | null;
  createdAt: string;
}

/**
 * Fetch photos for an entity via photo_entity_links dual-read.
 * For RECEIVING_LINE, includes parent PO-level photos (not other lines).
 */
export async function getEntityPhotos(
  organizationId: string,
  entity: TicketEntityRef,
): Promise<EntityPhoto[]> {
  const byId = new Map<number, EntityPhoto>();

  const addRows = (
    rows: Awaited<ReturnType<typeof listPhotosForEntity>>,
  ) => {
    for (const row of rows) {
      if (byId.has(row.id)) continue;
      byId.set(row.id, {
        id: row.id,
        url: row.url?.startsWith('/api/photos/') ? row.url : photoContentUrl(row.id),
        caption: row.photoType,
        takenByStaffId: row.takenByStaffId,
        createdAt: row.createdAt,
      });
    }
  };

  if (entity.type === 'RECEIVING_LINE') {
    addRows(
      await listPhotosForEntity({
        organizationId,
        entityType: 'RECEIVING_LINE',
        entityId: entity.id,
      }),
    );
    const parent = await tenantQuery<{ receiving_id: number | null }>(
      organizationId,
      `SELECT receiving_id FROM receiving_line WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [entity.id, organizationId],
    );
    const receivingId = parent.rows[0]?.receiving_id;
    if (receivingId != null) {
      addRows(
        await listPhotosForEntity({
          organizationId,
          entityType: 'RECEIVING',
          entityId: Number(receivingId),
        }),
      );
    }
  } else if (entity.type === 'RECEIVING') {
    addRows(
      await listPhotosForEntity({
        organizationId,
        entityType: 'RECEIVING',
        entityId: entity.id,
        receivingId: entity.id,
      }),
    );
  } else {
    const entityType = entity.type as PhotoEntityType;
    addRows(
      await listPhotosForEntity({
        organizationId,
        entityType,
        entityId: entity.id,
      }),
    );
  }

  return [...byId.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
