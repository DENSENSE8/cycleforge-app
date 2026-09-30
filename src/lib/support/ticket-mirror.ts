/**
 * Local mirror of helpdesk tickets — the ticket object, its FULL comment thread,
 * and the helpdesk users behind it live in our DB (support_tickets mirror
 * columns + support_ticket_comments + zendesk_users), so ticket detail renders
 * from one DB round trip instead of a live provider fan-out on every open.
 *
 *   read   readTicketMirror  — one statement (tenantQueryOneTrip + json_agg):
 *                              ticket, thread, authors, staff identity,
 *                              in-app assignment, linked entity + its photos.
 *   load   loadTicketMirror  — local-first; a mirror older than
 *                              TICKET_MIRROR_FRESH_MS is served as-is and
 *                              re-mirrored in `after()`; no mirror → fetch live
 *                              once, write, read back.
 *   write  writeTicketMirror / refreshTicketMirror — the only writers. Every
 *                              HelpdeskProvider ticket write (zendesk-adapter)
 *                              and the ticket-watch cron re-mirror through
 *                              remirrorFetchedTicket; scripts/backfill-ticket-mirror
 *                              and revalidation call refreshTicketMirror.
 *
 * Author identity is resolved at READ time (zendesk_users + helpdesk_comment_staff
 * + staff), so a staff binding recorded after a post shows without a re-mirror.
 */
import { after } from 'next/server';
import type { ZendeskAgent, ZendeskComment, ZendeskTicket, ZendeskUser } from '@/lib/zendesk';
import { getHelpdeskProvider, type HelpdeskProvider } from '@/lib/integrations/helpdesk';
import {
  staffHitsByEmail,
  staffHitsByName,
  type StaffAuthorHit,
} from '@/lib/integrations/helpdesk/comment-staff-identity';
import { upsertSupportTicket } from '@/lib/support/tickets';
import {
  agentsFromUsers,
  commentToMirrorRow,
  enrichMirrorComments,
  isTicketMirrorFresh,
  mirrorRowToComment,
  ticketToMirrorColumns,
  type MirrorCommentRow,
  type MirrorUserRow,
} from '@/lib/support/ticket-mirror-core';
import { tenantQuery, tenantQueryOneTrip } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  mapTicketAssignmentRow,
  TICKET_ASSIGNMENT_SELECT,
  type TicketAssignment,
} from '@/lib/zendesk-assignments';
import {
  entityPhotosSql,
  mapEntityPhotoRow,
  type EntityPhoto,
  type EntityPhotoRow,
} from '@/lib/zendesk-links';
import {
  demoteFormerAgents,
  getCachedUsers,
  upsertCachedUsers,
} from '@/lib/zendesk-users-cache';

export interface TicketMirrorEntity {
  type: string;
  id: number;
  source: 'ticket_links' | 'external_id' | 'unfound_overlay';
}

export interface TicketMirror {
  supportTicketId: number;
  /** Last full mirror (ticket + thread), ISO. */
  mirroredAt: string;
  /** The provider ticket object, verbatim. */
  ticket: ZendeskTicket;
  /** The whole thread, oldest first, author identity attached. */
  comments: ZendeskComment[];
  /** Assignable roster (agents + admins). */
  agents: ZendeskAgent[];
  requester: { id: number; name: string | null; email: string | null } | null;
  assignment: TicketAssignment | null;
  entity: TicketMirrorEntity | null;
  photos: EntityPhoto[];
}

interface MirrorReadRow {
  support_ticket_id: string;
  ticket_payload: ZendeskTicket;
  mirrored_at: Date | string;
  requester_zendesk_user_id: string | null;
  comments: MirrorCommentRow[];
  users: MirrorUserRow[];
  staff_by_comment: Array<{ comment_id: number; staff_id: number; name: string }>;
  staff_by_email: Array<{ id: number; name: string; email: string | null }>;
  staff_by_name: Array<{ id: number; name: string }>;
  assignment: Record<string, unknown> | null;
  entity: TicketMirrorEntity | null;
  photos: EntityPhotoRow[];
}

/**
 * $1 org, $2 provider ticket id as text, $3 as a number, $4 as '#id'.
 * Entity resolution mirrors getTicketEntity (zendesk-links.ts): primary
 * ticket_links → the MIRRORED ticket's external_id → unfound_overlay — with no
 * live provider call.
 */
const READ_MIRROR_SQL = `
WITH t AS (
  SELECT st.id, st.ticket_payload, st.mirrored_at, st.provider_external_id,
         st.requester_zendesk_user_id
    FROM support_tickets st
   WHERE st.organization_id = $1
     AND st.provider = 'zendesk'
     AND st.external_ticket_id = $2
     AND st.mirrored_at IS NOT NULL
   LIMIT 1
),
c AS (
  SELECT c.*
    FROM support_ticket_comments c
    JOIN t ON c.support_ticket_id = t.id
   WHERE c.organization_id = $1
),
people AS (
  SELECT author_zendesk_user_id AS uid FROM c WHERE author_zendesk_user_id > 0
  UNION
  SELECT requester_zendesk_user_id FROM t WHERE requester_zendesk_user_id > 0
),
u AS (
  SELECT zu.zendesk_user_id, zu.name, zu.email, zu.photo_url, zu.role
    FROM zendesk_users zu
   WHERE zu.organization_id = $1
     AND (zu.zendesk_user_id IN (SELECT uid FROM people) OR zu.role IN ('agent', 'admin'))
),
ent AS (
  SELECT e.type, e.id, e.source
    FROM (
      SELECT tl.entity_type AS type, tl.entity_id::bigint AS id, 'ticket_links'::text AS source, 1 AS rank
        FROM ticket_links tl
       WHERE tl.organization_id = $1 AND tl.zendesk_ticket_id = $3 AND tl.is_primary
      UNION ALL
      SELECT upper(m[1]), m[2]::bigint, 'external_id', 2
        FROM t, regexp_match(t.provider_external_id, '^([A-Za-z_]+):([0-9]+)$') AS m
       WHERE m IS NOT NULL
      UNION ALL
      SELECT 'RECEIVING', o.source_id::bigint, 'unfound_overlay', 3
        FROM (SELECT ov.source_kind, ov.source_id
                FROM unfound_overlay ov
               WHERE ov.organization_id = $1 AND ov.zendesk_ticket_id IN ($2, $4)
               LIMIT 1) o
       WHERE o.source_kind = 'unmatched_receiving' AND o.source_id ~ '^[0-9]+$'
    ) e
   ORDER BY e.rank
   LIMIT 1
)
SELECT t.id AS support_ticket_id,
       t.ticket_payload,
       t.mirrored_at,
       t.requester_zendesk_user_id,
       COALESCE((
         SELECT json_agg(json_build_object(
                  'external_comment_id', c.external_comment_id,
                  'author_zendesk_user_id', c.author_zendesk_user_id,
                  'comment_type', c.comment_type,
                  'audit_id', c.audit_id,
                  'body', c.body,
                  'html_body', c.html_body,
                  'plain_body', c.plain_body,
                  'is_public', c.is_public,
                  'attachments', c.attachments,
                  'via', c.via,
                  'metadata', c.metadata,
                  'extra', c.extra,
                  'external_created_at',
                    to_char(c.external_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
                ORDER BY c.external_created_at, c.external_comment_id)
           FROM c), '[]'::json) AS comments,
       COALESCE((SELECT json_agg(u ORDER BY u.zendesk_user_id) FROM u), '[]'::json) AS users,
       COALESCE((
         SELECT json_agg(json_build_object('comment_id', h.zendesk_comment_id,
                                           'staff_id', h.staff_id, 'name', s.name))
           FROM helpdesk_comment_staff h
           JOIN staff s ON s.id = h.staff_id AND s.organization_id = h.organization_id
          WHERE h.organization_id = $1
            AND h.zendesk_comment_id IN (SELECT external_comment_id FROM c)), '[]'::json) AS staff_by_comment,
       COALESCE((
         SELECT json_agg(json_build_object('id', s.id, 'name', s.name, 'email', s.email) ORDER BY s.id)
           FROM staff s
          WHERE s.organization_id = $1
            AND s.email IS NOT NULL
            AND lower(s.email) IN (
                  SELECT lower(btrim(u.email)) FROM u
                   WHERE u.email IS NOT NULL AND u.zendesk_user_id IN (SELECT uid FROM people))),
         '[]'::json) AS staff_by_email,
       -- Superset for the note sign-off fallback: staff whose name appears in
       -- any comment; staffHitsByName + applyStaffAuthor pick the real match.
       COALESCE((
         SELECT json_agg(json_build_object('id', s.id, 'name', s.name) ORDER BY s.id)
           FROM staff s
          WHERE s.organization_id = $1
            AND btrim(s.name) <> ''
            AND EXISTS (SELECT 1 FROM c WHERE strpos(lower(c.body), lower(btrim(s.name))) > 0)),
         '[]'::json) AS staff_by_name,
       (SELECT row_to_json(a)
          FROM (${TICKET_ASSIGNMENT_SELECT}
                 WHERE a.organization_id = $1 AND a.zendesk_ticket_id = $3
                 LIMIT 1) a) AS assignment,
       (SELECT row_to_json(ent) FROM ent) AS entity,
       COALESCE((
         SELECT json_agg(ph ORDER BY ph.created_at DESC, ph.id)
           FROM (${entityPhotosSql('$1', '(SELECT type FROM ent)', '(SELECT id FROM ent)')}) ph),
         '[]'::json) AS photos
  FROM t`;

/** The mirrored ticket, or null when it was never (fully) mirrored. One DB round trip. */
export async function readTicketMirror(
  orgId: OrgId,
  externalTicketId: number,
): Promise<TicketMirror | null> {
  const { rows } = await tenantQueryOneTrip<MirrorReadRow>(orgId, READ_MIRROR_SQL, [
    orgId,
    String(externalTicketId),
    externalTicketId,
    `#${externalTicketId}`,
  ]);
  const row = rows[0];
  if (!row) return null;

  const byCommentId = new Map<number, StaffAuthorHit>(
    row.staff_by_comment.map((h) => [
      Number(h.comment_id),
      { staffId: Number(h.staff_id), name: h.name },
    ]),
  );
  const comments = enrichMirrorComments(row.comments.map(mirrorRowToComment), {
    users: row.users,
    byCommentId,
    byEmail: staffHitsByEmail(row.staff_by_email),
    byName: staffHitsByName(row.staff_by_name),
  });

  const requesterId =
    row.requester_zendesk_user_id != null ? Number(row.requester_zendesk_user_id) : null;
  const requesterRow =
    requesterId != null
      ? row.users.find((u) => Number(u.zendesk_user_id) === requesterId)
      : undefined;

  return {
    supportTicketId: Number(row.support_ticket_id),
    mirroredAt: new Date(row.mirrored_at).toISOString(),
    ticket: row.ticket_payload,
    comments,
    agents: agentsFromUsers(row.users),
    requester:
      requesterId != null
        ? {
            id: requesterId,
            name: requesterRow?.name ?? null,
            email: requesterRow?.email ?? null,
          }
        : null,
    assignment: row.assignment ? mapTicketAssignmentRow(row.assignment) : null,
    entity: row.entity
      ? { type: row.entity.type, id: Number(row.entity.id), source: row.entity.source }
      : null,
    photos: row.photos.map(mapEntityPhotoRow),
  };
}

/** $1 org, $2 support_tickets.id, $3..$11 promoted ticket columns, $12 comment rows (jsonb). */
const WRITE_MIRROR_SQL = `
WITH st AS (
  UPDATE support_tickets
     SET ticket_payload            = $3::jsonb,
         requester_zendesk_user_id = $4,
         assignee_zendesk_user_id  = $5,
         priority                  = $6,
         ticket_type               = $7,
         tags                      = $8::text[],
         provider_external_id      = $9,
         external_created_at       = $10,
         external_updated_at       = $11,
         mirrored_at               = NOW(),
         updated_at                = NOW()
   WHERE organization_id = $1 AND id = $2
  RETURNING id
),
incoming AS (
  SELECT *
    FROM jsonb_to_recordset($12::jsonb) AS x(
           external_comment_id bigint, author_zendesk_user_id bigint, comment_type text,
           audit_id bigint, body text, html_body text, plain_body text, is_public boolean,
           attachments jsonb, via jsonb, metadata jsonb, extra jsonb,
           external_created_at timestamptz)
),
upserted AS (
  INSERT INTO support_ticket_comments
    (organization_id, support_ticket_id, external_comment_id, author_zendesk_user_id,
     comment_type, audit_id, body, html_body, plain_body, is_public, attachments, via,
     metadata, extra, external_created_at, mirrored_at)
  SELECT $1::uuid, st.id, i.external_comment_id, i.author_zendesk_user_id,
         i.comment_type, i.audit_id, i.body, i.html_body, i.plain_body, i.is_public,
         COALESCE(i.attachments, '[]'::jsonb), i.via, i.metadata, COALESCE(i.extra, '{}'::jsonb),
         i.external_created_at, NOW()
    FROM st, incoming i
  ON CONFLICT (organization_id, external_comment_id) DO UPDATE
     SET support_ticket_id      = EXCLUDED.support_ticket_id,
         author_zendesk_user_id = EXCLUDED.author_zendesk_user_id,
         comment_type           = EXCLUDED.comment_type,
         audit_id               = EXCLUDED.audit_id,
         body                   = EXCLUDED.body,
         html_body              = EXCLUDED.html_body,
         plain_body             = EXCLUDED.plain_body,
         is_public              = EXCLUDED.is_public,
         attachments            = EXCLUDED.attachments,
         via                    = EXCLUDED.via,
         metadata               = EXCLUDED.metadata,
         extra                  = EXCLUDED.extra,
         external_created_at    = EXCLUDED.external_created_at,
         mirrored_at            = NOW()
  RETURNING 1
)
DELETE FROM support_ticket_comments d
 USING st
 WHERE d.organization_id = $1
   AND d.support_ticket_id = st.id
   AND NOT EXISTS (SELECT 1 FROM incoming i WHERE i.external_comment_id = d.external_comment_id)`;

/**
 * Persist one ticket's full mirror. `comments` MUST be the complete thread —
 * mirrored comments absent from it are deleted. `agents` (the assignable
 * roster) also demotes cached users no longer on it, so the mirrored roster
 * stays the live one.
 */
export async function writeTicketMirror(
  orgId: OrgId,
  input: {
    ticket: ZendeskTicket;
    comments: ZendeskComment[];
    users?: ZendeskUser[];
    agents?: ZendeskAgent[];
  },
): Promise<{ supportTicketId: number }> {
  const cols = ticketToMirrorColumns(input.ticket);
  // The registry owns external id → support_tickets.id (and subject/status caches).
  const registry = await upsertSupportTicket({
    orgId,
    provider: 'zendesk',
    externalTicketId: String(input.ticket.id),
    subjectCache: cols.subject,
    statusCache: cols.status,
  });

  const agents = input.agents ?? [];
  await Promise.all([
    tenantQuery(orgId, WRITE_MIRROR_SQL, [
      orgId,
      registry.id,
      JSON.stringify(input.ticket),
      cols.requesterUserId,
      cols.assigneeUserId,
      cols.priority,
      cols.ticketType,
      cols.tags,
      cols.providerExternalId,
      cols.externalCreatedAt,
      cols.externalUpdatedAt,
      JSON.stringify(input.comments.map(commentToMirrorRow)),
    ]),
    (async () => {
      await upsertCachedUsers(orgId, [...agents, ...(input.users ?? [])]);
      if (agents.length) {
        await demoteFormerAgents(
          orgId,
          agents.map((a) => a.id),
        );
      }
    })(),
  ]);
  return { supportTicketId: registry.id };
}

/** Every page of the thread (the provider pages at 100). */
async function listFullThread(
  helpdesk: HelpdeskProvider,
  ticketId: number,
): Promise<ZendeskComment[]> {
  const all: ZendeskComment[] = [];
  for (let page = 1; page <= 50; page++) {
    const res = await helpdesk.listComments(ticketId, { page, perPage: 100 });
    all.push(...res.comments);
    if (!res.next_page || res.comments.length === 0) break;
  }
  return all;
}

async function fetchAndWriteTicketMirror(
  orgId: OrgId,
  helpdesk: HelpdeskProvider,
  ticketId: number,
  known: ZendeskTicket | undefined,
): Promise<boolean> {
  const threadPromise = listFullThread(helpdesk, ticketId);
  // Observed below only when the ticket exists; never an unhandled rejection.
  threadPromise.catch(() => undefined);
  const [ticket, agents] = await Promise.all([
    known ?? helpdesk.getTicket(ticketId),
    helpdesk.listAgents(false).catch(() => [] as ZendeskAgent[]),
  ]);
  if (!ticket) return false;
  const comments = await threadPromise;

  // Resolve authors + requester the roster doesn't cover and the DB cache lacks.
  const agentIds = new Set(agents.map((a) => a.id));
  const people = new Set<number>(comments.map((c) => Number(c.author_id)));
  if (ticket.requester_id) people.add(Number(ticket.requester_id));
  const candidates = [...people].filter((id) => id > 0 && !agentIds.has(id));
  const cached = candidates.length ? await getCachedUsers(orgId, candidates) : new Map();
  const missing = candidates.filter((id) => !cached.has(id));
  const users = missing.length ? await helpdesk.getUsers(missing).catch(() => []) : [];

  await writeTicketMirror(orgId, { ticket, comments, users, agents });
  return true;
}

const inFlightRefresh = new Map<string, Promise<boolean>>();

/**
 * Fetch the ticket + full thread live and write the mirror. Returns false when
 * the provider has no such ticket. Pass `ticket` (fresh from a write response)
 * to skip the getTicket call; those calls never join an in-flight revalidation,
 * which may have listed the thread before the write landed.
 */
export async function refreshTicketMirror(
  orgId: OrgId,
  helpdesk: HelpdeskProvider,
  ticketId: number,
  opts: { ticket?: ZendeskTicket } = {},
): Promise<boolean> {
  if (opts.ticket) return fetchAndWriteTicketMirror(orgId, helpdesk, ticketId, opts.ticket);
  const key = `${orgId}:${ticketId}`;
  const pending = inFlightRefresh.get(key);
  if (pending) return pending;
  const run = fetchAndWriteTicketMirror(orgId, helpdesk, ticketId, undefined).finally(() => {
    inFlightRefresh.delete(key);
  });
  inFlightRefresh.set(key, run);
  return run;
}

/**
 * Re-mirror with a ticket object fresh from the provider (a write response, or
 * the watch poll's getTicket) so the next read shows it. Never throws — the
 * write/poll already succeeded; a failed mirror only means the next stale read
 * revalidates.
 */
export async function remirrorFetchedTicket(
  orgId: OrgId,
  helpdesk: HelpdeskProvider,
  ticket: ZendeskTicket,
): Promise<void> {
  try {
    await refreshTicketMirror(orgId, helpdesk, Number(ticket.id), { ticket });
  } catch (err) {
    console.warn('[ticket-mirror] re-mirror failed', ticket.id, err);
  }
}

/** Drop a ticket's mirror (provider-side delete) so no read serves it again. */
export async function forgetTicketMirror(orgId: OrgId, ticketId: number): Promise<void> {
  await tenantQuery(
    orgId,
    `WITH st AS (
       UPDATE support_tickets
          SET mirrored_at = NULL, ticket_payload = NULL, updated_at = NOW()
        WHERE organization_id = $1 AND provider = 'zendesk' AND external_ticket_id = $2
       RETURNING id
     )
     DELETE FROM support_ticket_comments c
      USING st
      WHERE c.organization_id = $1 AND c.support_ticket_id = st.id`,
    [orgId, String(ticketId)],
  );
}

export type TicketMirrorLoad =
  | { status: 'not_configured' }
  | { status: 'not_found' }
  | { status: 'ok'; mirror: TicketMirror };

/**
 * Local-first ticket read for request handlers (uses `after()`). The provider
 * connection check runs beside the mirror read, so a warm open is one DB round
 * trip of latency. `refresh` forces a live re-mirror before reading.
 */
export async function loadTicketMirror(
  orgId: OrgId,
  ticketId: number,
  opts: { refresh?: boolean } = {},
): Promise<TicketMirrorLoad> {
  const [helpdesk, mirrored] = await Promise.all([
    getHelpdeskProvider(orgId).then(async (h) => (h && (await h.isConfigured()) ? h : null)),
    opts.refresh ? null : readTicketMirror(orgId, ticketId),
  ]);
  if (!helpdesk) return { status: 'not_configured' };

  if (mirrored) {
    if (!isTicketMirrorFresh(mirrored.mirroredAt, Date.now())) {
      after(async () => {
        try {
          await refreshTicketMirror(orgId, helpdesk, ticketId);
        } catch (err) {
          console.warn('[ticket-mirror] revalidation failed', ticketId, err);
        }
      });
    }
    return { status: 'ok', mirror: mirrored };
  }

  if (!(await refreshTicketMirror(orgId, helpdesk, ticketId))) return { status: 'not_found' };
  const mirror = await readTicketMirror(orgId, ticketId);
  return mirror ? { status: 'ok', mirror } : { status: 'not_found' };
}
