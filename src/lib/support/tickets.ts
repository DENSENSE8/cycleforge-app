/**
 * Platform-agnostic support ticket registry — internal ticket id (#42) is what
 * operators see; provider-native ids (Zendesk today) live in external_ticket_id.
 * Polymorphic entity linkage stays on ticket_links.
 */
import { tenantQueriesOneTrip, tenantQuery, tenantQueryOneTrip } from '@/lib/tenancy/db';

export { looksLikeTicketScan, parseTicketScanValue } from '@/lib/support/ticket-scan';

export type SupportTicketProvider = 'zendesk' | 'internal';

// Pure ref helpers (TicketReceivingRef, normalizeReceivingTicketEntityRefs, pickTicketLinkAnchor, …) live in ./ticket-refs so client code…
export * from '@/lib/support/ticket-refs';
import {
  formatSupportTicketLabel,
  normalizeReceivingTicketEntityRefs,
  type TicketReceivingRef,
} from '@/lib/support/ticket-refs';

export interface SupportTicketRow {
  id: number;
  provider: SupportTicketProvider;
  externalTicketId: string | null;
  subjectCache: string | null;
  statusCache: string | null;
  /** ticket_links.created_at when resolved via a polymorphic link (omit if unknown). */
  linkedAt?: string | null;
  /** Initials from ticket_links.created_by → staff.name (omit if unknown). */
  linkedByInitials?: string | null;
}

/** Provider-native display label — matches the media library claims chip (`#9395` for Zendesk tickets), so a claim photo and its ticket… */
export function formatSupportTicketDisplayLabel(ticket: SupportTicketRow): string {
  if (ticket.provider === 'zendesk' && ticket.externalTicketId) {
    return `#${ticket.externalTicketId.replace(/^#/, '')}`;
  }
  return formatSupportTicketLabel(ticket.id);
}

/** Two-letter initials from a staff display name; null when empty. */
function staffInitials(name: string | null | undefined): string | null {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

function mapRow(row: {
  id: string | number;
  provider: string;
  external_ticket_id: string | null;
  subject_cache: string | null;
  status_cache: string | null;
  linked_at?: string | null;
  linked_by_name?: string | null;
}): SupportTicketRow {
  return {
    id: Number(row.id),
    provider: row.provider as SupportTicketProvider,
    externalTicketId: row.external_ticket_id,
    subjectCache: row.subject_cache,
    statusCache: row.status_cache,
    linkedAt: row.linked_at ?? null,
    linkedByInitials: staffInitials(row.linked_by_name),
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
    if (existing.rows[0]) {
      const row = existing.rows[0];
      const nextSubject =
        args.subjectCache !== undefined ? args.subjectCache ?? null : row.subject_cache;
      const nextStatus =
        args.statusCache !== undefined ? args.statusCache ?? null : row.status_cache;
      if (nextSubject !== row.subject_cache || nextStatus !== row.status_cache) {
        const updated = await tenantQuery<{
          id: string;
          provider: string;
          external_ticket_id: string | null;
          subject_cache: string | null;
          status_cache: string | null;
        }>(
          args.orgId,
          `UPDATE support_tickets
              SET subject_cache = $4,
                  status_cache = $5,
                  updated_at = NOW()
            WHERE organization_id = $1 AND provider = $2 AND external_ticket_id = $3
            RETURNING id, provider, external_ticket_id, subject_cache, status_cache`,
          [args.orgId, args.provider, external, nextSubject, nextStatus],
        );
        if (updated.rows[0]) return mapRow(updated.rows[0]);
      }
      return mapRow(row);
    }
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

/**
 * Pull live Zendesk fields into `support_tickets` for one watched ticket.
 * Returns whether subject/status changed vs the previous cache (for notify).
 */
export async function syncZendeskTicketRegistryCaches(args: {
  orgId: string;
  zendeskTicketId: number;
  subject: string | null;
  status: string | null;
  staffId?: number | null;
}): Promise<{
  row: SupportTicketRow;
  changed: boolean;
  previous: { subject: string | null; status: string | null };
}> {
  const external = String(args.zendeskTicketId);
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
      WHERE organization_id = $1 AND provider = 'zendesk' AND external_ticket_id = $2
      LIMIT 1`,
    [args.orgId, external],
  );
  const previous = {
    subject: existing.rows[0]?.subject_cache ?? null,
    status: existing.rows[0]?.status_cache ?? null,
  };
  const nextSubject = args.subject?.trim() || null;
  const nextStatus = args.status?.trim() || null;
  const changed =
    !existing.rows[0] ||
    previous.subject !== nextSubject ||
    previous.status !== nextStatus;

  const row = await upsertSupportTicket({
    orgId: args.orgId,
    provider: 'zendesk',
    externalTicketId: external,
    subjectCache: nextSubject,
    statusCache: nextStatus,
    staffId: args.staffId ?? null,
  });

  return { row, changed, previous };
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
  const parent = await tenantQueryOneTrip<{ receiving_id: number | null }>(
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
  const existing = await tenantQueryOneTrip<SupportTicketDbRow>(
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

interface TicketReadStatement {
  text: string;
  params: unknown[];
}

/** A ticket_links hit: its registry row, or the pre-registry Zendesk id it still carries. */
type TicketLinkDbRow = SupportTicketDbRow & {
  zendesk_ticket_id: string | null;
  linked_at: string | null;
  linked_by_name: string | null;
};

function positiveZendeskId(value: number | null): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

async function ticketFromLinkRow(
  orgId: string,
  row: TicketLinkDbRow | undefined,
): Promise<SupportTicketRow | null> {
  if (!row) return null;
  if (row.id) return mapRow(row);
  const zd = positiveZendeskId(row.zendesk_ticket_id != null ? Number(row.zendesk_ticket_id) : null);
  return zd != null ? supportTicketFromZendeskId(orgId, zd) : null;
}

/** Direct ticket_links on RECEIVING / RECEIVING_LINE (incl. pre-migration rows). */
function directEntityLinksStatement(args: {
  orgId: string;
  serialUnitId?: number | null;
  lineId?: number | null;
  receivingId?: number | null;
}): TicketReadStatement | null {
  const { orgId, serialUnitId, lineId, receivingId } = args;
  if (serialUnitId == null && lineId == null && receivingId == null) return null;

  const clauses: string[] = [];
  const params: unknown[] = [orgId];
  if (serialUnitId != null) {
    params.push(serialUnitId);
    clauses.push(`(tl.entity_type = 'SERIAL_UNIT' AND tl.entity_id = $${params.length})`);
  }
  if (lineId != null) {
    params.push(lineId);
    clauses.push(`(tl.entity_type = 'RECEIVING_LINE' AND tl.entity_id = $${params.length})`);
    if (serialUnitId == null) {
      clauses.push(`(tl.entity_type = 'SERIAL_UNIT' AND tl.entity_id IN (SELECT sup.serial_unit_id FROM serial_unit_provenance sup WHERE sup.origin_type = 'RECEIVING_LINE' AND sup.origin_id = $${params.length} AND sup.organization_id = $1))`);
    }
  }
  if (receivingId != null) {
    params.push(receivingId);
    clauses.push(`(tl.entity_type = 'RECEIVING' AND tl.entity_id = $${params.length})`);
    if (serialUnitId == null && lineId == null) {
      clauses.push(`(tl.entity_type = 'SERIAL_UNIT' AND tl.entity_id IN (SELECT sup.serial_unit_id FROM serial_unit_provenance sup WHERE sup.origin_type = 'RECEIVING_LINE' AND sup.origin_id IN (SELECT id FROM receiving_line WHERE receiving_id = $${params.length} AND organization_id = $1) AND sup.organization_id = $1))`);
    }
  }

  return {
    text: `SELECT st.id, st.provider, st.external_ticket_id, st.subject_cache, st.status_cache,
            tl.zendesk_ticket_id,
            tl.created_at AS linked_at,
            s.name AS linked_by_name
       FROM ticket_links tl
       LEFT JOIN support_tickets st ON st.id = tl.support_ticket_id
       LEFT JOIN staff s ON s.id = tl.created_by
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
  };
}

/**
 * Photos on this carton/line that also carry a ZENDESK_TICKET link — same source
 * the media library uses for claims ticket chips (#9395).
 */
function photoEntityLinksStatement(args: {
  orgId: string;
  lineId?: number | null;
  receivingId?: number | null;
}): TicketReadStatement | null {
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

  return {
    text: `SELECT pel_z.entity_id AS zendesk_ticket_id
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
  };
}

function zendeskIdFromColumn(row: { zendesk_ticket: string | null } | undefined): number | null {
  const raw = row?.zendesk_ticket?.trim();
  const digits = raw ? raw.match(/\d+/)?.[0] : null;
  return positiveZendeskId(digits ? Number(digits) : NaN);
}

/**
 * Primary ticket linked to a receiving carton, line, or physical unit.
 *
 * Evidence in precedence order: direct ticket_links → the carton's STN link →
 * claim photos' ZENDESK_TICKET links → the denormalized `zendesk_ticket` column
 * (line, then carton). Every candidate read is independent, so they travel as
 * ONE round trip and the first hit in that order wins.
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
    const parent = await tenantQueryOneTrip<{ receiving_line_id: number | null }>(
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
  if (serialUnitId == null && lineId == null && receivingIdArg == null) return null;

  const receivingId = await resolveReceivingId({ orgId, lineId, receivingId: receivingIdArg });
  const cartonId = receivingId ?? receivingIdArg ?? null;

  const direct = directEntityLinksStatement({ orgId, serialUnitId, lineId, receivingId: cartonId });
  // ticket_links on SHIPMENT (STN id) for the carton's receiving.shipment_id.
  const viaShipment: TicketReadStatement | null =
    receivingId != null
      ? {
          text: `SELECT st.id, st.provider, st.external_ticket_id, st.subject_cache, st.status_cache,
            tl.zendesk_ticket_id,
            tl.created_at AS linked_at,
            s.name AS linked_by_name
       FROM receiving_carton r
       JOIN ticket_links tl
         ON tl.organization_id = r.organization_id
        AND tl.entity_type = 'SHIPMENT'
        AND tl.entity_id = r.shipment_id
       LEFT JOIN support_tickets st ON st.id = tl.support_ticket_id
       LEFT JOIN staff s ON s.id = tl.created_by
      WHERE r.organization_id = $1
        AND r.id = $2
        AND r.shipment_id IS NOT NULL
      -- is_primary first: a ticket ANCHORED to this STN is about the shipment;
      -- one that merely references it (among several STNs) is weaker evidence.
      ORDER BY tl.is_primary DESC, tl.created_at DESC
      LIMIT 1`,
          params: [orgId, receivingId],
        }
      : null;
  const viaPhotos = photoEntityLinksStatement({ orgId, lineId, receivingId: cartonId });
  // The denormalized `zendesk_ticket` display-cache columns — the line's, then the carton's.
  const lineColumn: TicketReadStatement | null =
    lineId != null
      ? {
          text: `SELECT zendesk_ticket FROM receiving_line WHERE organization_id = $1 AND id = $2 LIMIT 1`,
          params: [orgId, lineId],
        }
      : null;
  const cartonColumn: TicketReadStatement | null =
    cartonId != null
      ? {
          text: `SELECT zendesk_ticket FROM receiving_carton WHERE organization_id = $1 AND id = $2 LIMIT 1`,
          params: [orgId, cartonId],
        }
      : null;

  const statements = [direct, viaShipment, viaPhotos, lineColumn, cartonColumn].filter(
    (s): s is TicketReadStatement => s != null,
  );
  const results = await tenantQueriesOneTrip(orgId, statements);
  const firstRow = <T>(statement: TicketReadStatement | null): T | undefined =>
    statement ? (results[statements.indexOf(statement)]?.rows[0] as T | undefined) : undefined;

  const fromDirect = await ticketFromLinkRow(orgId, firstRow<TicketLinkDbRow>(direct));
  if (fromDirect) return fromDirect;

  const fromShipment = await ticketFromLinkRow(orgId, firstRow<TicketLinkDbRow>(viaShipment));
  if (fromShipment) return fromShipment;

  const photoRow = firstRow<{ zendesk_ticket_id: string | null }>(viaPhotos);
  const photoZd = positiveZendeskId(
    photoRow?.zendesk_ticket_id != null ? Number(photoRow.zendesk_ticket_id) : null,
  );
  if (photoZd != null) return supportTicketFromZendeskId(orgId, photoZd);

  // Last resort: the denormalized `zendesk_ticket` display column — the line's, then the carton's.
  const columnZd =
    zendeskIdFromColumn(firstRow(lineColumn)) ?? zendeskIdFromColumn(firstRow(cartonColumn));
  return columnZd != null ? supportTicketFromZendeskId(orgId, columnZd) : null;
}

/** Resolve a scanned value to a materialized receiving carton via support_tickets. */
export async function resolveSupportTicketToReceiving(
  orgId: string,
  scanValue: string,
): Promise<TicketReceivingRef | null> {
  const trimmed = scanValue.trim();
  const digits = trimmed.replace(/^#/, '');
  if (!/^\d{1,12}$/.test(digits)) return null;
  const numeric = Number(digits);

  // Internal id match first (operator scans #42), else the legacy Zendesk-id
  // scan (pre-migration labels) — one statement, the id match ranked first.
  const ticketRes = await tenantQueryOneTrip<{ id: string }>(
    orgId,
    `SELECT id FROM support_tickets
      WHERE organization_id = $1
        AND (id = $2 OR (provider = 'zendesk' AND external_ticket_id = $3))
      ORDER BY (id = $2) DESC
      LIMIT 1`,
    [orgId, numeric, digits],
  );

  const supportTicketId = ticketRes.rows[0] ? Number(ticketRes.rows[0].id) : null;
  if (supportTicketId == null) return null;

  // `AND is_primary`: resolve the ticket's ANCHOR. ticket_links is
  // many-per-ticket now, so a bare LIMIT 1 would return an arbitrary reference
  // row (e.g. one of several STNs) and resolve the ticket to the wrong entity.
  const link = await tenantQueryOneTrip<{ entity_type: string; entity_id: string }>(
    orgId,
    `SELECT entity_type, entity_id FROM ticket_links
      WHERE organization_id = $1 AND support_ticket_id = $2 AND is_primary
      LIMIT 1`,
    [orgId, supportTicketId],
  );
  if (!link.rows[0]) return null;

  const type = link.rows[0].entity_type;
  const id = Number(link.rows[0].entity_id);
  if (type === 'RECEIVING') return { receivingId: id, supportTicketId };
  if (type === 'RECEIVING_LINE') {
    const parent = await tenantQueryOneTrip<{ receiving_id: number | null }>(
      orgId,
      `SELECT receiving_id FROM receiving_line
        WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [id, orgId],
    );
    const receivingId = parent.rows[0]?.receiving_id;
    if (receivingId != null) return { receivingId, lineId: id, supportTicketId };
  }
  if (type === 'SHIPMENT') {
    const carton = await tenantQueryOneTrip<{ id: string }>(
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
