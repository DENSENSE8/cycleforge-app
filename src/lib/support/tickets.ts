/**
 * Platform-agnostic support ticket registry — internal ticket id (#42) is what
 * operators see; provider-native ids (Zendesk today) live in external_ticket_id.
 * Polymorphic entity linkage stays on ticket_links.
 */
import { tenantQuery } from '@/lib/tenancy/db';

export { looksLikeTicketScan, parseTicketScanValue } from '@/lib/support/ticket-scan';

export type SupportTicketProvider = 'zendesk' | 'internal';

export interface TicketReceivingRef {
  receivingId: number;
  lineId?: number;
  supportTicketId: number;
}

/** Synthetic line id (`-receiving_id`) for unfound cartons with no receiving_line row. */
export function isPlaceholderReceivingLineId(lineId: number | null | undefined): boolean {
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
  let receivingId = args.receivingId ?? null;
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

export interface SupportTicketRow {
  id: number;
  provider: SupportTicketProvider;
  externalTicketId: string | null;
  subjectCache: string | null;
  statusCache: string | null;
}

/** Internal registry label — `#42`. */
export function formatSupportTicketLabel(ticketId: number): string {
  return `#${ticketId}`;
}

/**
 * Operator-facing label — matches the media library claims chip (`#9395` for
 * Zendesk tickets). Internal-only tickets still use the registry id.
 */
export function formatSupportTicketDisplayLabel(ticket: SupportTicketRow): string {
  if (ticket.provider === 'zendesk' && ticket.externalTicketId) {
    return `#${ticket.externalTicketId.replace(/^#/, '')}`;
  }
  return formatSupportTicketLabel(ticket.id);
}

function mapRow(row: {
  id: string | number;
  provider: string;
  external_ticket_id: string | null;
  subject_cache: string | null;
  status_cache: string | null;
}): SupportTicketRow {
  return {
    id: Number(row.id),
    provider: row.provider as SupportTicketProvider,
    externalTicketId: row.external_ticket_id,
    subjectCache: row.subject_cache,
    statusCache: row.status_cache,
  };
}

/** Upsert a provider ticket into the org registry; returns the internal id. */
export async function upsertSupportTicket(args: {
  orgId: string;
  provider: SupportTicketProvider;
  externalTicketId?: string | null;
  subjectCache?: string | null;
  statusCache?: string | null;
  staffId?: number | null;
}): Promise<SupportTicketRow> {
  const external = args.externalTicketId?.trim() || null;
  if (external) {
    const existing = await tenantQuery<{
      id: string;
      provider: string;
      external_ticket_id: string | null;
      subject_cache: string | null;
      status_cache: string | null;
    }>(
      args.orgId,
      `SELECT id, provider, external_ticket_id, subject_cache, status_cache
         FROM support_tickets
        WHERE organization_id = $1 AND provider = $2 AND external_ticket_id = $3
        LIMIT 1`,
      [args.orgId, args.provider, external],
    );
    if (existing.rows[0]) return mapRow(existing.rows[0]);
  }

  const inserted = await tenantQuery<{
    id: string;
    provider: string;
    external_ticket_id: string | null;
    subject_cache: string | null;
    status_cache: string | null;
  }>(
    args.orgId,
    `INSERT INTO support_tickets
       (organization_id, provider, external_ticket_id, subject_cache, status_cache, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, provider, external_ticket_id, subject_cache, status_cache`,
    [
      args.orgId,
      args.provider,
      external,
      args.subjectCache ?? null,
      args.statusCache ?? null,
      args.staffId ?? null,
    ],
  );
  return mapRow(inserted.rows[0]);
}

type SupportTicketDbRow = {
  id: string;
  provider: string;
  external_ticket_id: string | null;
  subject_cache: string | null;
  status_cache: string | null;
};

async function resolveReceivingId(args: {
  orgId: string;
  lineId?: number | null;
  receivingId?: number | null;
}): Promise<number | null> {
  if (args.receivingId != null) return args.receivingId;
  if (args.lineId == null) return null;
  const parent = await tenantQuery<{ receiving_id: number | null }>(
    args.orgId,
    `SELECT receiving_id FROM receiving_line
      WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [args.lineId, args.orgId],
  );
  const id = parent.rows[0]?.receiving_id;
  return id != null ? Number(id) : null;
}

async function supportTicketFromZendeskId(
  orgId: string,
  zendeskTicketId: number,
): Promise<SupportTicketRow> {
  const existing = await tenantQuery<SupportTicketDbRow>(
    orgId,
    `SELECT id, provider, external_ticket_id, subject_cache, status_cache
       FROM support_tickets
      WHERE organization_id = $1
        AND provider = 'zendesk'
        AND external_ticket_id = $2
      LIMIT 1`,
    [orgId, String(zendeskTicketId)],
  );
  if (existing.rows[0]) return mapRow(existing.rows[0]);
  return upsertSupportTicket({
    orgId,
    provider: 'zendesk',
    externalTicketId: String(zendeskTicketId),
  });
}

/** Direct ticket_links on RECEIVING / RECEIVING_LINE (incl. pre-migration rows). */
async function ticketFromDirectEntityLinks(args: {
  orgId: string;
  lineId?: number | null;
  receivingId?: number | null;
}): Promise<SupportTicketRow | null> {
  const { orgId, lineId, receivingId } = args;
  if (lineId == null && receivingId == null) return null;

  const clauses: string[] = [];
  const params: unknown[] = [orgId];
  if (lineId != null) {
    params.push(lineId);
    clauses.push(`(tl.entity_type = 'RECEIVING_LINE' AND tl.entity_id = $${params.length})`);
    clauses.push(`(tl.entity_type = 'SERIAL_UNIT' AND tl.entity_id IN (SELECT sup.serial_unit_id FROM serial_unit_provenance sup WHERE sup.origin_type = 'RECEIVING_LINE' AND sup.origin_id = $${params.length} AND sup.organization_id = $1))`);
  }
  if (receivingId != null) {
    params.push(receivingId);
    clauses.push(`(tl.entity_type = 'RECEIVING' AND tl.entity_id = $${params.length})`);
    clauses.push(`(tl.entity_type = 'SERIAL_UNIT' AND tl.entity_id IN (SELECT sup.serial_unit_id FROM serial_unit_provenance sup WHERE sup.origin_type = 'RECEIVING_LINE' AND sup.origin_id IN (SELECT id FROM receiving_line WHERE receiving_id = $${params.length} AND organization_id = $1) AND sup.organization_id = $1))`);
  }

  const res = await tenantQuery<SupportTicketDbRow & { zendesk_ticket_id: string | null }>(
    orgId,
    `SELECT st.id, st.provider, st.external_ticket_id, st.subject_cache, st.status_cache,
            tl.zendesk_ticket_id
       FROM ticket_links tl
       LEFT JOIN support_tickets st ON st.id = tl.support_ticket_id
      WHERE tl.organization_id = $1
        AND (${clauses.join(' OR ')})
      ORDER BY
        CASE tl.entity_type 
          WHEN 'SERIAL_UNIT' THEN 0 
          WHEN 'RECEIVING_LINE' THEN 1 
          ELSE 2 
        END,
        tl.created_at DESC
      LIMIT 1`,
    params,
  );
  const row = res.rows[0];
  if (!row) return null;
  if (row.id) return mapRow(row);
  const zd = row.zendesk_ticket_id != null ? Number(row.zendesk_ticket_id) : null;
  if (zd != null && Number.isFinite(zd) && zd > 0) {
    return supportTicketFromZendeskId(orgId, zd);
  }
  return null;
}

/** ticket_links on SHIPMENT (STN id) for the carton's receiving.shipment_id. */
async function ticketFromShipmentLink(
  orgId: string,
  receivingId: number,
): Promise<SupportTicketRow | null> {
  const res = await tenantQuery<SupportTicketDbRow & { zendesk_ticket_id: string | null }>(
    orgId,
    `SELECT st.id, st.provider, st.external_ticket_id, st.subject_cache, st.status_cache,
            tl.zendesk_ticket_id
       FROM receiving_carton r
       JOIN ticket_links tl
         ON tl.organization_id = r.organization_id
        AND tl.entity_type = 'SHIPMENT'
        AND tl.entity_id = r.shipment_id
       LEFT JOIN support_tickets st ON st.id = tl.support_ticket_id
      WHERE r.organization_id = $1
        AND r.id = $2
        AND r.shipment_id IS NOT NULL
      ORDER BY tl.created_at DESC
      LIMIT 1`,
    [orgId, receivingId],
  );
  const row = res.rows[0];
  if (!row) return null;
  if (row.id) return mapRow(row);
  const zd = row.zendesk_ticket_id != null ? Number(row.zendesk_ticket_id) : null;
  if (zd != null && Number.isFinite(zd) && zd > 0) {
    return supportTicketFromZendeskId(orgId, zd);
  }
  return null;
}

/**
 * Photos on this carton/line that also carry a ZENDESK_TICKET link — same source
 * the media library uses for claims ticket chips (#9395).
 */
async function ticketFromPhotoEntityLinks(args: {
  orgId: string;
  lineId?: number | null;
  receivingId?: number | null;
}): Promise<SupportTicketRow | null> {
  const { orgId, lineId, receivingId } = args;
  if (lineId == null && receivingId == null) return null;

  const recvClauses: string[] = [];
  const params: unknown[] = [orgId];
  if (receivingId != null) {
    params.push(receivingId);
    recvClauses.push(`(pel_recv.entity_type = 'RECEIVING' AND pel_recv.entity_id = $${params.length})`);
  }
  if (lineId != null) {
    params.push(lineId);
    recvClauses.push(`(pel_recv.entity_type = 'RECEIVING_LINE' AND pel_recv.entity_id = $${params.length})`);
  }

  const res = await tenantQuery<{ zendesk_ticket_id: string }>(
    orgId,
    `SELECT pel_z.entity_id AS zendesk_ticket_id
       FROM photo_entity_links pel_recv
       JOIN photo_entity_links pel_z
         ON pel_z.photo_id = pel_recv.photo_id
        AND pel_z.organization_id = pel_recv.organization_id
        AND pel_z.entity_type = 'ZENDESK_TICKET'
      WHERE pel_recv.organization_id = $1
        AND (${recvClauses.join(' OR ')})
      ORDER BY pel_z.entity_id::bigint DESC
      LIMIT 1`,
    params,
  );
  const zd = res.rows[0]?.zendesk_ticket_id != null ? Number(res.rows[0].zendesk_ticket_id) : null;
  if (zd == null || !Number.isFinite(zd) || zd <= 0) return null;
  return supportTicketFromZendeskId(orgId, zd);
}

/**
 * Denormalized display-cache fallback: the `zendesk_ticket` column on
 * receiving_line / receiving_carton (stored "#<id>"). Authoritative link tables
 * win above — this only resolves the column when they're all empty, so the
 * carton header (which resolves via this fn) agrees with the rail flag / pairing
 * "Claim ticket" row, both of which read this column directly. The link/unlink
 * routes write and clear the column in lockstep with ticket_links, so a set
 * column means genuinely-linked (no ghost after an unlink).
 */
async function ticketFromReceivingColumn(args: {
  orgId: string;
  lineId?: number | null;
  receivingId?: number | null;
}): Promise<SupportTicketRow | null> {
  const { orgId, lineId, receivingId } = args;
  if (lineId == null && receivingId == null) return null;

  const readZendeskId = async (sql: string, id: number): Promise<number | null> => {
    const res = await tenantQuery<{ zendesk_ticket: string | null }>(orgId, sql, [orgId, id]);
    const raw = res.rows[0]?.zendesk_ticket?.trim();
    const digits = raw ? raw.match(/\d+/)?.[0] : null;
    const zd = digits ? Number(digits) : NaN;
    return Number.isFinite(zd) && zd > 0 ? zd : null;
  };

  // Prefer the specific line's column, then the carton's.
  let zd: number | null = null;
  if (lineId != null) {
    zd = await readZendeskId(
      `SELECT zendesk_ticket FROM receiving_line WHERE organization_id = $1 AND id = $2 LIMIT 1`,
      lineId,
    );
  }
  if (zd == null && receivingId != null) {
    zd = await readZendeskId(
      `SELECT zendesk_ticket FROM receiving_carton WHERE organization_id = $1 AND id = $2 LIMIT 1`,
      receivingId,
    );
  }
  if (zd == null) return null;
  return supportTicketFromZendeskId(orgId, zd);
}

/**
 * Primary ticket linked to a receiving carton/line. Resolution order:
 *   1. ticket_links on RECEIVING / RECEIVING_LINE
 *   2. ticket_links on SHIPMENT via receiving.shipment_id (STN)
 *   3. ZENDESK_TICKET on photos linked to this carton/line (media library SoT)
 *   4. `zendesk_ticket` display column on receiving_line / receiving_carton
 */
export async function getPrimarySupportTicketForReceiving(args: {
  orgId: string;
  lineId?: number | null;
  receivingId?: number | null;
  serialUnitId?: number | null;
}): Promise<SupportTicketRow | null> {
  const { orgId, serialUnitId } = args;
  let resolvedLineId = args.lineId ?? null;

  if (serialUnitId != null && resolvedLineId == null) {
    const parent = await tenantQuery<{ receiving_line_id: number | null }>(
      orgId,
      `SELECT origin_id AS receiving_line_id
         FROM serial_unit_provenance
        WHERE serial_unit_id = $1 AND origin_type = 'RECEIVING_LINE' AND organization_id = $2
        ORDER BY occurred_at DESC LIMIT 1`,
      [serialUnitId, orgId]
    );
    if (parent.rows[0]?.receiving_line_id != null) {
      resolvedLineId = Number(parent.rows[0].receiving_line_id);
    }
  }

  const { lineId, receivingId: receivingIdArg } = normalizeReceivingTicketEntityRefs({
    ...args,
    lineId: resolvedLineId,
  });
  if (lineId == null && receivingIdArg == null) return null;

  const receivingId = await resolveReceivingId({ orgId, lineId, receivingId: receivingIdArg });

  const direct = await ticketFromDirectEntityLinks({
    orgId,
    lineId,
    receivingId: receivingId ?? receivingIdArg ?? null,
  });
  if (direct) return direct;

  if (receivingId != null) {
    const viaShipment = await ticketFromShipmentLink(orgId, receivingId);
    if (viaShipment) return viaShipment;
  }

  const viaPhotos = await ticketFromPhotoEntityLinks({
    orgId,
    lineId,
    receivingId: receivingId ?? receivingIdArg ?? null,
  });
  if (viaPhotos) return viaPhotos;

  // Last resort: the denormalized `zendesk_ticket` display column. The authoritative
  // link tables win above; this only fires when the column is set but every
  // polymorphic link is missing (out-of-sync legacy rows, or a ticket_links write
  // that never landed). Without it the carton header shows the CLAIM button while
  // the rail flag / pairing row — which read this column — already show the ticket.
  return ticketFromReceivingColumn({
    orgId,
    lineId,
    receivingId: receivingId ?? receivingIdArg ?? null,
  });
}

/** Resolve a scanned value to a materialized receiving carton via support_tickets. */
export async function resolveSupportTicketToReceiving(
  orgId: string,
  scanValue: string,
): Promise<{ receivingId: number; lineId?: number; supportTicketId: number } | null> {
  const trimmed = scanValue.trim();
  const digits = trimmed.replace(/^#/, '');
  if (!/^\d{1,12}$/.test(digits)) return null;
  const numeric = Number(digits);

  // Internal id match first (operator scans #42).
  let ticketRes = await tenantQuery<{ id: string }>(
    orgId,
    `SELECT id FROM support_tickets
      WHERE organization_id = $1 AND id = $2
      LIMIT 1`,
    [orgId, numeric],
  );

  // Legacy Zendesk-id scan fallback (pre-migration labels).
  if (!ticketRes.rows[0]) {
    ticketRes = await tenantQuery<{ id: string }>(
      orgId,
      `SELECT id FROM support_tickets
        WHERE organization_id = $1 AND provider = 'zendesk' AND external_ticket_id = $2
        LIMIT 1`,
      [orgId, digits],
    );
  }

  const supportTicketId = ticketRes.rows[0] ? Number(ticketRes.rows[0].id) : null;
  if (supportTicketId == null) return null;

  const link = await tenantQuery<{ entity_type: string; entity_id: string }>(
    orgId,
    `SELECT entity_type, entity_id FROM ticket_links
      WHERE organization_id = $1 AND support_ticket_id = $2
      LIMIT 1`,
    [orgId, supportTicketId],
  );
  if (!link.rows[0]) return null;

  const type = link.rows[0].entity_type;
  const id = Number(link.rows[0].entity_id);
  if (type === 'RECEIVING') return { receivingId: id, supportTicketId };
  if (type === 'RECEIVING_LINE') {
    const parent = await tenantQuery<{ receiving_id: number | null }>(
      orgId,
      `SELECT receiving_id FROM receiving_line
        WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [id, orgId],
    );
    const receivingId = parent.rows[0]?.receiving_id;
    if (receivingId != null) return { receivingId, lineId: id, supportTicketId };
  }
  if (type === 'SHIPMENT') {
    const carton = await tenantQuery<{ id: string }>(
      orgId,
      `SELECT id FROM receiving_carton
        WHERE organization_id = $1 AND shipment_id = $2
        ORDER BY updated_at DESC
        LIMIT 1`,
      [orgId, id],
    );
    const receivingId = carton.rows[0] ? Number(carton.rows[0].id) : null;
    if (receivingId != null) return { receivingId, supportTicketId };
  }
  return null;
}
