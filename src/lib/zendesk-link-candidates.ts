/**
 * Shared "link an existing Zendesk ticket" candidate resolution.
 *
 * Every surface that links an EXISTING ticket to an internal entity (receiving
 * carton/line, warranty claim, …) needs the same three behaviours:
 *   • no query        → most recent tickets (newest first)
 *   • "#1234" / short bare id → direct id lookup (the manual-entry path)
 *   • carrier tracking / anything else → Zendesk search
 * …and the same "hide tickets already linked to a DIFFERENT entity" rule, with
 * a ticket linked to THIS entity flagged `linkedToThis` so the UI shows it as
 * done. Centralising it here keeps the receiving and warranty link routes from
 * drifting into parallel implementations (the manual-id path must behave
 * identically to a list pick on every surface).
 *
 * Id vs search is {@link resolveTicketLinkQueryKind} — 12-digit FedEx must not
 * call getTicket.
 */
import pool from '@/lib/db';
import {
  getTicket,
  listTickets,
  searchTickets,
  type ZendeskTicket,
} from '@/lib/zendesk';
import { parseExternalId } from '@/lib/zendesk-links';
import { zendeskTicketUrl } from '@/lib/zendesk-ticket-url';
import { resolveTicketLinkQueryKind } from '@/lib/support/ticket-link-query';

export interface TicketLinkCandidate {
  id: number;
  subject: string | null;
  description: string | null;
  status: string;
  priority: string | null;
  createdAt: string;
  updatedAt: string;
  url: string | null;
  /** True when this ticket is already linked to the requesting entity. */
  linkedToThis: boolean;
  /**
   * `reference` mode only — the entity this ticket is ANCHORED to, when that is
   * something else. Not a reason to hide it; the UI shows it as context so an
   * operator knows what else the ticket is about.
   */
  anchoredElsewhere?: { type: string; id: number } | null;
}

/**
 * `anchor` — picking the ONE entity a ticket is about. Tickets anchored to a
 * different entity are hidden, because choosing one would re-anchor it.
 *
 * `reference` — attaching an ADDITIONAL entity (e.g. a second STN) to a ticket
 * that keeps its existing anchor. Nothing is hidden: a ticket already anchored to
 * a carton is a perfectly valid target for another shipment. Applying the anchor
 * rule here would hide exactly the tickets the operator is looking for, and the
 * "already linked to other items" copy would be a lie.
 */
export type TicketLinkCandidateMode = 'anchor' | 'reference';

export async function listTicketLinkCandidates(args: {
  orgId: string;
  entityType: string;
  entityId: number;
  query?: string | null;
  perPage?: number;
  mode?: TicketLinkCandidateMode;
}): Promise<{ tickets: TicketLinkCandidate[]; hiddenLinked: number }> {
  const mode: TicketLinkCandidateMode = args.mode ?? 'anchor';
  const perPage = args.perPage ?? 20;
  const queryKind = resolveTicketLinkQueryKind(args.query ?? '');

  let tickets: ZendeskTicket[];
  if (queryKind.kind === 'recent') {
    tickets = (await listTickets({ perPage }, args.orgId)).tickets;
  } else if (queryKind.kind === 'id') {
    const ticket = await getTicket(queryKind.ticketId, args.orgId);
    tickets = ticket ? [ticket] : [];
  } else {
    tickets = (await searchTickets(queryKind.query, { perPage }, args.orgId)).results;
  }

  // Resolve existing links for the whole result page in two bulk queries
  // (ticket_links is authoritative; unfound_overlay stores the id as text,
  // sometimes "#"-prefixed). external_id rides along on the search payload.
  const ids = tickets.map((t) => t.id);
  const linkByTicket = new Map<number, { type: string; id: number }>();
  if (ids.length > 0) {
    // `AND is_primary`: linkByTicket is a ticket → ONE entity map, but
    // ticket_links is many-per-ticket now. Without the filter, a ticket holding
    // extra reference rows (e.g. additional STNs) would set the map repeatedly
    // and an arbitrary row would win, mislabelling which entity "owns" it.
    const links = await pool.query<{ zendesk_ticket_id: string; entity_type: string; entity_id: string }>(
      `SELECT zendesk_ticket_id, entity_type, entity_id FROM ticket_links
        WHERE organization_id = $1 AND zendesk_ticket_id = ANY($2::bigint[]) AND is_primary`,
      [args.orgId, ids],
    );
    for (const row of links.rows) {
      linkByTicket.set(Number(row.zendesk_ticket_id), { type: row.entity_type, id: Number(row.entity_id) });
    }
    const overlay = await pool.query<{ zendesk_ticket_id: string; source_kind: string; source_id: string }>(
      `SELECT zendesk_ticket_id, source_kind, source_id FROM unfound_overlay
        WHERE organization_id = $1
          AND zendesk_ticket_id = ANY($2::text[])`,
      [args.orgId, ids.flatMap((id) => [String(id), `#${id}`])],
    );
    for (const row of overlay.rows) {
      const ticketId = Number(String(row.zendesk_ticket_id).replace(/^#/, ''));
      if (linkByTicket.has(ticketId)) continue;
      const isReceiving = row.source_kind === 'unmatched_receiving' && /^\d+$/.test(row.source_id);
      linkByTicket.set(
        ticketId,
        isReceiving ? { type: 'RECEIVING', id: Number(row.source_id) } : { type: 'UNFOUND', id: 0 },
      );
    }
  }

  let hiddenLinked = 0;
  const out: TicketLinkCandidate[] = [];
  for (const t of tickets) {
    const link = linkByTicket.get(t.id) ?? parseExternalId(t.external_id as string | undefined);
    const linkedToThis = !!link && link.type === args.entityType && link.id === args.entityId;
    // Anchor mode hides tickets anchored elsewhere (picking one would re-anchor
    // it). Reference mode keeps them — see TicketLinkCandidateMode.
    if (mode === 'anchor' && link && !linkedToThis) {
      hiddenLinked++;
      continue;
    }
    out.push({
      id: t.id,
      subject: t.subject ?? null,
      // First comment body — enough for the expanded preview row; capped so
      // a long email thread doesn't bloat the list payload.
      description: typeof t.description === 'string' ? t.description.slice(0, 600) : null,
      status: String(t.status ?? ''),
      priority: t.priority ? String(t.priority) : null,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      url: zendeskTicketUrl(t.id),
      linkedToThis,
      anchoredElsewhere:
        mode === 'reference' && link && !linkedToThis ? { type: link.type, id: link.id } : null,
    });
  }

  return { tickets: out, hiddenLinked };
}
