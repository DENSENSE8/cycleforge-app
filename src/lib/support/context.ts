/**
 * Support Context Hub bundle — one read that resolves linkage, ticket, thread,
 * connections, and a merged activity timeline from any of
 * {order, tracking, ticket, receivingId/lineId}.
 *
 * Anchor-agnostic so GlobalHeaderSearch can deep-link later without API changes.
 */
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import {
  resolveOrderLinkage,
  type OrderLinkage,
} from '@/lib/order-linkage';
import {
  formatSupportTicketDisplayLabel,
  getPrimarySupportTicketForReceiving,
  resolveSupportTicketToReceiving,
  type SupportTicketRow,
} from '@/lib/support/tickets';
import type {
  SupportContextBundle,
  SupportContextTicket,
  SupportContextThread,
} from '@/lib/support/context-types';
import {
  buildSupportContextLinkable,
  pickSupportContextAnchorMeta,
  pickSupportContextThreadEntity,
} from '@/lib/support/context-anchor';
import { zendeskTicketUrl } from '@/lib/zendesk-ticket-url';
import { resolveShipmentForScan } from '@/lib/receiving/resolve-shipment-for-scan';
import { getOrCreateThread, listThreadMessages } from '@/lib/threads/threads';
import {
  resolveThreadConnections,
  resolveThreadLinksAsConnections,
} from '@/lib/threads/resolve-thread-connections';
import type { ThreadConnection } from '@/lib/threads/types';
import {
  mergeSupportContextTimeline,
  type CarrierEvent,
  type OpsEventRow,
  type ThreadMessageTimelineRow,
  type TicketLinkTimelineRow,
  type TimelineItem,
} from '@/lib/timeline';
import { getTicketEntity } from '@/lib/zendesk-links';

export type {
  SupportContextBundle,
  SupportContextLinkable,
  SupportContextTicket,
  SupportContextThread,
} from '@/lib/support/context-types';

export {
  buildSupportContextLinkable,
  pickSupportContextAnchorMeta,
  pickSupportContextThreadEntity,
} from '@/lib/support/context-anchor';

export interface SupportContextInput {
  order?: string | null;
  tracking?: string | null;
  ticket?: string | null;
  receivingId?: number | null;
  lineId?: number | null;
  /** When true, get-or-create the entity thread (default true). */
  ensureThread?: boolean;
  staffId?: number | null;
}

function mapTicket(row: SupportTicketRow): SupportContextTicket {
  const providerTicketId =
    row.provider === 'zendesk' && row.externalTicketId
      ? Number(row.externalTicketId.replace(/^#/, ''))
      : null;
  const valid =
    providerTicketId != null && Number.isFinite(providerTicketId) && providerTicketId > 0;
  return {
    id: row.id,
    label: formatSupportTicketDisplayLabel(row),
    provider: row.provider,
    externalTicketId: row.externalTicketId,
    providerTicketId: valid ? providerTicketId : null,
    openUrl: valid ? zendeskTicketUrl(providerTicketId!) : null,
    subject: row.subjectCache,
    status: row.statusCache,
  };
}

async function lookupSupportTicketByScan(
  orgId: OrgId,
  scan: string,
): Promise<SupportTicketRow | null> {
  const trimmed = scan.trim().replace(/^#/, '');
  if (!/^\d{1,12}$/.test(trimmed)) return null;
  const numeric = Number(trimmed);

  let res = await tenantQuery<{
    id: string;
    provider: string;
    external_ticket_id: string | null;
    subject_cache: string | null;
    status_cache: string | null;
  }>(
    orgId,
    `SELECT id, provider, external_ticket_id, subject_cache, status_cache
       FROM support_tickets
      WHERE organization_id = $1 AND id = $2
      LIMIT 1`,
    [orgId, numeric],
  );
  if (!res.rows[0]) {
    res = await tenantQuery(
      orgId,
      `SELECT id, provider, external_ticket_id, subject_cache, status_cache
         FROM support_tickets
        WHERE organization_id = $1 AND provider = 'zendesk' AND external_ticket_id = $2
        LIMIT 1`,
      [orgId, trimmed],
    );
  }
  const row = res.rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    provider: row.provider as SupportTicketRow['provider'],
    externalTicketId: row.external_ticket_id,
    subjectCache: row.subject_cache,
    statusCache: row.status_cache,
  };
}

async function fetchTimelineSpines(args: {
  orgId: OrgId;
  receivingId: number | null;
  shipmentIds: number[];
  threadId: number | null;
}): Promise<TimelineItem[]> {
  const { orgId, receivingId, shipmentIds, threadId } = args;

  const [opsRes, carrierRes, msgRes, linkRes] = await Promise.all([
    receivingId != null
      ? tenantQuery<OpsEventRow>(
          orgId,
          `SELECT id, occurred_at, event_type, entity_type, entity_id
             FROM ops_events
            WHERE organization_id = $1
              AND lower(entity_type) = 'receiving'
              AND entity_id = $2
            ORDER BY occurred_at DESC
            LIMIT 100`,
          [orgId, receivingId],
        )
      : Promise.resolve({ rows: [] as OpsEventRow[] }),
    shipmentIds.length > 0
      ? tenantQuery<CarrierEvent>(
          orgId,
          `SELECT e.id, e.event_occurred_at, e.normalized_status_category,
                  e.external_status_label, e.external_status_description,
                  e.event_city, e.event_state, e.exception_description, e.signed_by
             FROM shipment_tracking_events e
            WHERE e.shipment_id = ANY($1::bigint[])
            ORDER BY e.event_occurred_at DESC NULLS LAST
            LIMIT 100`,
          [shipmentIds],
        )
      : Promise.resolve({ rows: [] as CarrierEvent[] }),
    threadId != null
      ? listThreadMessages({ orgId, threadId, limit: 50 }).then((r) =>
          r.ok
            ? r.messages.map(
                (m): ThreadMessageTimelineRow => ({
                  id: m.id,
                  visibility: m.visibility,
                  provider: m.provider,
                  body: m.body,
                  createdAt: m.createdAt,
                  authorName: m.authorName ?? null,
                }),
              )
            : [],
        )
      : Promise.resolve([] as ThreadMessageTimelineRow[]),
    receivingId != null || shipmentIds.length > 0
      ? tenantQuery<{
          id: string;
          created_at: string;
          zendesk_ticket_id: string | null;
          entity_type: string;
          actor_name: string | null;
        }>(
          orgId,
          `SELECT tl.id, tl.created_at, tl.zendesk_ticket_id, tl.entity_type,
                  s.name AS actor_name
             FROM ticket_links tl
             LEFT JOIN staff s ON s.id = tl.created_by
            WHERE tl.organization_id = $1
              AND (
                ($2::bigint IS NOT NULL AND tl.entity_type IN ('RECEIVING', 'RECEIVING_LINE')
                  AND (
                    (tl.entity_type = 'RECEIVING' AND tl.entity_id = $2)
                    OR (tl.entity_type = 'RECEIVING_LINE' AND tl.entity_id IN (
                      SELECT id FROM receiving_line WHERE receiving_id = $2 AND organization_id = $1
                    ))
                  ))
                OR (tl.entity_type = 'SHIPMENT' AND tl.entity_id = ANY($3::bigint[]))
              )
            ORDER BY tl.created_at DESC
            LIMIT 20`,
          [orgId, receivingId, shipmentIds.length ? shipmentIds : [0]],
        )
      : Promise.resolve({ rows: [] }),
  ]);

  const ticketLinks: TicketLinkTimelineRow[] = (linkRes.rows ?? []).map((r) => ({
    id: r.id,
    at: r.created_at,
    kind: 'linked' as const,
    ticketLabel: r.zendesk_ticket_id ? `#${r.zendesk_ticket_id}` : '#—',
    actorName: r.actor_name,
  }));

  return mergeSupportContextTimeline({
    opsEvents: opsRes.rows ?? [],
    carrierEvents: carrierRes.rows ?? [],
    threadMessages: Array.isArray(msgRes) ? msgRes : [],
    ticketLinks,
  });
}

/**
 * Resolve the full Support Context Hub bundle from any one identifier.
 */
export async function resolveSupportContext(
  orgId: OrgId,
  input: SupportContextInput,
): Promise<SupportContextBundle> {
  const emptyLinkage: OrderLinkage = {
    matchedBy: null,
    order: null,
    trackings: [],
    serials: [],
    tickets: [],
  };

  let receivingId = input.receivingId ?? null;
  let lineId = input.lineId ?? null;
  let tracking = (input.tracking ?? '').trim() || null;
  let orderQ = (input.order ?? '').trim() || null;
  let ticketScan = (input.ticket ?? '').trim() || null;
  let ticketRow: SupportTicketRow | null = null;
  let providerTicketId: number | null = null;

  // ── Ticket anchor: reverse-resolve to receiving / shipment ───────────────
  if (ticketScan) {
    ticketRow = await lookupSupportTicketByScan(orgId, ticketScan);
    if (ticketRow?.provider === 'zendesk' && ticketRow.externalTicketId) {
      providerTicketId = Number(ticketRow.externalTicketId.replace(/^#/, ''));
    }
    const hit = await resolveSupportTicketToReceiving(orgId, ticketScan).catch(() => null);
    if (hit) {
      receivingId = hit.receivingId;
      lineId = hit.lineId ?? lineId;
    } else if (providerTicketId != null && Number.isFinite(providerTicketId)) {
      const entity = await getTicketEntity(orgId, providerTicketId).catch(() => null);
      if (entity?.type === 'SHIPMENT') {
        const carton = await tenantQuery<{ id: string; tracking: string | null }>(
          orgId,
          `SELECT r.id, stn.tracking_number_raw AS tracking
             FROM receiving_carton r
             LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
            WHERE r.organization_id = $1 AND r.shipment_id = $2
            ORDER BY r.updated_at DESC LIMIT 1`,
          [orgId, entity.id],
        );
        if (carton.rows[0]) {
          receivingId = Number(carton.rows[0].id);
          tracking = tracking ?? carton.rows[0].tracking;
        } else {
          const stn = await tenantQuery<{ tracking_number_raw: string | null }>(
            orgId,
            `SELECT tracking_number_raw FROM shipping_tracking_numbers
              WHERE organization_id = $1 AND id = $2 LIMIT 1`,
            [orgId, entity.id],
          );
          tracking = tracking ?? stn.rows[0]?.tracking_number_raw ?? null;
        }
      } else if (entity?.type === 'RECEIVING') {
        receivingId = entity.id;
      } else if (entity?.type === 'RECEIVING_LINE') {
        lineId = entity.id;
        const parent = await tenantQuery<{ receiving_id: number | null }>(
          orgId,
          `SELECT receiving_id FROM receiving_line WHERE id = $1 AND organization_id = $2`,
          [entity.id, orgId],
        );
        if (parent.rows[0]?.receiving_id != null) {
          receivingId = Number(parent.rows[0].receiving_id);
        }
      }
    }
  }

  // ── Tracking → STN → carton ──────────────────────────────────────────────
  let shipmentId: number | null = null;
  if (tracking) {
    const resolved = await resolveShipmentForScan(tracking, orgId);
    shipmentId = resolved.shipmentId;
    if (resolved.receivingId != null && receivingId == null) {
      receivingId = resolved.receivingId;
    }
  }

  // ── Carton → tracking when we only have receiving ────────────────────────
  if (receivingId != null && !tracking) {
    const carton = await tenantQuery<{
      shipment_id: number | null;
      tracking: string | null;
    }>(
      orgId,
      `SELECT r.shipment_id, stn.tracking_number_raw AS tracking
         FROM receiving_carton r
         LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
        WHERE r.id = $1 AND r.organization_id = $2 LIMIT 1`,
      [receivingId, orgId],
    );
    if (carton.rows[0]) {
      shipmentId = carton.rows[0].shipment_id != null
        ? Number(carton.rows[0].shipment_id)
        : shipmentId;
      tracking = carton.rows[0].tracking;
    }
  }

  // ── Linkage (order loop) ─────────────────────────────────────────────────
  const linkage = await resolveOrderLinkage(orgId, {
    order: orderQ,
    tracking,
    serial: null,
  }).catch(() => emptyLinkage);

  if (!tracking && linkage.trackings[0]?.tracking) {
    tracking = linkage.trackings[0].tracking;
  }
  const shipmentIds = [
    ...new Set(
      [
        shipmentId,
        ...linkage.trackings.map((t) => t.shipmentId),
      ].filter((n): n is number => n != null && Number.isFinite(n)),
    ),
  ];

  // ── Primary ticket ───────────────────────────────────────────────────────
  if (!ticketRow && (receivingId != null || lineId != null)) {
    ticketRow = await getPrimarySupportTicketForReceiving({
      orgId,
      receivingId,
      lineId,
    });
  }
  if (!ticketRow && linkage.tickets[0]?.supportTicketId) {
    const st = await tenantQuery<{
      id: string;
      provider: string;
      external_ticket_id: string | null;
      subject_cache: string | null;
      status_cache: string | null;
    }>(
      orgId,
      `SELECT id, provider, external_ticket_id, subject_cache, status_cache
         FROM support_tickets WHERE organization_id = $1 AND id = $2 LIMIT 1`,
      [orgId, linkage.tickets[0].supportTicketId],
    );
    if (st.rows[0]) {
      ticketRow = {
        id: Number(st.rows[0].id),
        provider: st.rows[0].provider as SupportTicketRow['provider'],
        externalTicketId: st.rows[0].external_ticket_id,
        subjectCache: st.rows[0].subject_cache,
        statusCache: st.rows[0].status_cache,
      };
    }
  }

  // ── Thread entity preference: line > carton > order ──────────────────────
  const threadEntity = pickSupportContextThreadEntity({
    lineId,
    receivingId,
    orderRowId: linkage.order?.id ?? null,
  });

  let thread: SupportContextThread | null = null;
  let connections: ThreadConnection[] = [];
  if (threadEntity != null) {
    const ensure = input.ensureThread !== false;
    if (ensure) {
      const created = await getOrCreateThread({
        orgId,
        entityType: threadEntity.entityType,
        entityId: threadEntity.entityId,
        createdBy: input.staffId ?? null,
      });
      if (created.ok) {
        thread = {
          id: created.thread.id,
          entityType: created.thread.entityType,
          entityId: created.thread.entityId,
          status: created.thread.status,
        };
      }
    }

    if (thread) {
      const [derived, curated] = await Promise.all([
        resolveThreadConnections(orgId, {
          entityType: thread.entityType,
          entityId: thread.entityId,
        }).catch(() => []),
        resolveThreadLinksAsConnections(orgId, thread.id).catch(() => []),
      ]);
      connections = [...derived, ...curated];
    } else {
      connections = await resolveThreadConnections(orgId, {
        entityType: threadEntity.entityType,
        entityId: threadEntity.entityId,
      }).catch(() => []);
    }
  }

  const timeline = await fetchTimelineSpines({
    orgId,
    receivingId,
    shipmentIds,
    threadId: thread?.id ?? null,
  });

  const linkable = buildSupportContextLinkable({
    lineId,
    receivingId,
    shipmentId: shipmentIds[0] ?? null,
    tracking,
    orderRowId: linkage.order?.id ?? null,
  });

  const anchor = pickSupportContextAnchorMeta({
    ticketScan,
    ticketLabel: ticketRow ? formatSupportTicketDisplayLabel(ticketRow) : null,
    receivingId,
    tracking,
    orderQ,
    orderLabel: linkage.order?.orderId ?? null,
    orderRowId: linkage.order?.id ?? null,
  });

  return {
    anchor,
    linkage,
    ticket: ticketRow ? mapTicket(ticketRow) : null,
    thread,
    connections,
    timeline,
    linkable,
  };
}
