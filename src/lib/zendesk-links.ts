/** Zendesk ticket ↔ internal entity linking + Blob-photo resolution. */
import type { PoolClient } from 'pg';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import { getTicket, updateTicket } from './zendesk';
import { upsertSupportTicket } from '@/lib/support/tickets';
import { photoContentUrl } from '@/lib/photos/display-url';
import { refreshReceivingUnitStageFacts } from '@/lib/receiving/receiving-unit-stage-facts';
import type { OrgId } from '@/lib/tenancy/constants';

interface TicketEntityRef {
  type: string;
  id: number;
}

interface ResolvedTicketEntity extends TicketEntityRef {
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

/** Canonical entity-link writer — the ONE place a support ticket's PRIMARY entity link (its anchor) is written, provider-agnostic. */
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
    // Demote whatever else held this ticket's anchor, so ux_ticket_links_support_anchor can never see two anchors mid-statement.
    const demoted = await c.query<{ entity_type: string; entity_id: string }>(
      `UPDATE ticket_links
          SET is_primary = false, link_role = 'reference', updated_at = NOW()
        WHERE organization_id = $1
          AND support_ticket_id = $2
          AND link_role = 'anchor'
          AND NOT (entity_type = $3 AND entity_id = $4)
        RETURNING entity_type, entity_id`,
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
    const touched = [
      ...demoted.rows.map((row) => ({ type: row.entity_type, id: Number(row.entity_id) })),
      { type: args.entityType, id: args.entityId },
    ];
    await refreshReceivingFactsForTicketEntities(args.orgId as OrgId, touched, c);
    return null;
  });
}

async function refreshReceivingFactsForTicketEntities(
  orgId: OrgId,
  entities: ReadonlyArray<{ type: string; id: number }>,
  client?: TxClient,
): Promise<void> {
  const receivingIds: number[] = [];
  const lineIds: number[] = [];
  const serialUnitIds: number[] = [];
  for (const entity of entities) {
    if (!Number.isInteger(entity.id) || entity.id <= 0) continue;
    if (entity.type === 'RECEIVING') receivingIds.push(entity.id);
    else if (entity.type === 'RECEIVING_LINE') lineIds.push(entity.id);
    else if (entity.type === 'SERIAL_UNIT') serialUnitIds.push(entity.id);
  }
  if (receivingIds.length + lineIds.length + serialUnitIds.length === 0) return;
  await refreshReceivingUnitStageFacts(
    orgId,
    { receivingIds, lineIds, serialUnitIds },
    client,
  );
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

/** Link a ticket to a shipment (STN id) AS ITS PRIMARY ANCHOR, so cartons anchored to that tracking number resolve the ticket via… */
async function linkTicketToShipment(args: {
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
  return withTenantTransaction(args.orgId, async (client) => {
    const res = await client.query(
      `DELETE FROM ticket_links
        WHERE organization_id = $1
          AND zendesk_ticket_id = $2
          AND entity_type = $3
          AND entity_id = $4`,
      [args.orgId, args.zendeskTicketId, args.entityType, args.entityId],
    );
    const removed = (res.rowCount ?? 0) > 0;
    if (removed) {
      await refreshReceivingFactsForTicketEntities(
        args.orgId as OrgId,
        [{ type: args.entityType, id: args.entityId }],
        client,
      );
    }
    return removed;
  });
}

/** Clear a Zendesk ticket's `external_id` — but ONLY when it still resolves to the given entity. */
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
  // 1. ticket_links (cheapest, authoritative) `AND is_primary` is load-bearing since ticket_links became many-per-ticket:
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

/** A row of {@link entityPhotosSql}. `created_at` is a Date via pg, an ISO string via json_agg. */
export interface EntityPhotoRow {
  id: string | number;
  photo_type: string | null;
  taken_by_staff_id: number | null;
  created_at: string | Date;
}

export function mapEntityPhotoRow(row: EntityPhotoRow): EntityPhoto {
  const id = Number(row.id);
  return {
    id,
    url: photoContentUrl(id),
    caption: row.photo_type,
    takenByStaffId: row.taken_by_staff_id,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * One SELECT for an entity's photos via photo_entity_links (distinct per photo;
 * callers order by created_at DESC). `org`, `type`, `id` are SQL expressions so
 * the ticket mirror can embed this in its one-trip read.
 *   RECEIVING      → the carton's photos + every line's under it.
 *   RECEIVING_LINE → the line's photos + its parent carton-level (PO) photos, not other lines.
 *   anything else  → photos linked to exactly (type, id).
 */
export function entityPhotosSql(org: string, type: string, id: string): string {
  return `
    SELECT DISTINCT p.id, p.photo_type, p.taken_by_staff_id, p.created_at
      FROM photos p
      JOIN photo_entity_links l ON l.photo_id = p.id AND l.organization_id = p.organization_id
      LEFT JOIN receiving_line rl ON l.entity_type = 'RECEIVING_LINE' AND rl.id = l.entity_id
     WHERE p.organization_id = ${org}
       AND CASE ${type}
             WHEN 'RECEIVING' THEN
                  (l.entity_type = 'RECEIVING' AND l.entity_id = ${id})
               OR (l.entity_type = 'RECEIVING_LINE' AND rl.receiving_id = ${id})
             WHEN 'RECEIVING_LINE' THEN
                  (l.entity_type = 'RECEIVING_LINE' AND l.entity_id = ${id})
               OR (l.entity_type = 'RECEIVING' AND l.entity_id = (
                     SELECT prl.receiving_id FROM receiving_line prl
                      WHERE prl.id = ${id} AND prl.organization_id = ${org}))
             ELSE l.entity_type = ${type} AND l.entity_id = ${id}
           END`;
}

/** Photos for an entity (see {@link entityPhotosSql}), newest first. */
export async function getEntityPhotos(
  organizationId: string,
  entity: TicketEntityRef,
): Promise<EntityPhoto[]> {
  const { rows } = await tenantQuery<EntityPhotoRow>(
    organizationId,
    `SELECT ph.* FROM (${entityPhotosSql('$1::uuid', '$2::text', '$3::bigint')}) ph
      ORDER BY ph.created_at DESC, ph.id`,
    [organizationId, entity.type, entity.id],
  );
  return rows.map(mapEntityPhotoRow);
}
