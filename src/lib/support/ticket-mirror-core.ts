/**
 * Pure pieces of the helpdesk ticket mirror (src/lib/support/ticket-mirror.ts):
 * provider comment ↔ support_ticket_comments row, ticket → promoted columns,
 * read-time author enrichment, the freshness decision, and comment paging.
 * No DB / network here so it unit-tests without env.
 */
import type { ZendeskAgent, ZendeskComment, ZendeskTicket } from '@/lib/zendesk';
import {
  applyStaffAuthor,
  type StaffAuthorHit,
} from '@/lib/integrations/helpdesk/comment-staff-identity';

/**
 * A mirror younger than this serves reads with no provider call at all; an
 * older one still serves the read immediately and is re-mirrored in `after()`
 * (stale-while-revalidate). 60 s keeps a customer reply that arrived in the
 * helpdesk at most one panel-open behind, while repeat opens of the same ticket
 * inside a minute cost zero provider quota. App-originated writes re-mirror
 * synchronously (write-through), so they never wait on this window.
 */
export const TICKET_MIRROR_FRESH_MS = 60_000;

/** True while `mirroredAt` is inside the freshness window (no revalidation needed). */
export function isTicketMirrorFresh(
  mirroredAt: string | null,
  nowMs: number,
  freshMs: number = TICKET_MIRROR_FRESH_MS,
): boolean {
  if (!mirroredAt) return false;
  const at = Date.parse(mirroredAt);
  if (!Number.isFinite(at)) return false;
  return nowMs - at < freshMs;
}

/** One support_ticket_comments row, as written and as read back (json_agg). */
export interface MirrorCommentRow {
  external_comment_id: number;
  author_zendesk_user_id: number | null;
  comment_type: string | null;
  audit_id: number | null;
  body: string | null;
  html_body: string | null;
  plain_body: string | null;
  is_public: boolean;
  attachments: unknown[];
  via: unknown;
  metadata: unknown;
  /** Provider keys not promoted to a column — kept so the read is the identical object. */
  extra: Record<string, unknown>;
  /** Provider timestamp, `YYYY-MM-DDTHH:MM:SSZ` (the read formats it back to this). */
  external_created_at: string;
}

const PROMOTED_COMMENT_KEYS = new Set([
  'id',
  'author_id',
  'type',
  'audit_id',
  'body',
  'html_body',
  'plain_body',
  'public',
  'attachments',
  'via',
  'metadata',
  'created_at',
]);

function numberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** Provider comment → mirror row. */
export function commentToMirrorRow(comment: ZendeskComment): MirrorCommentRow {
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(comment)) {
    if (!PROMOTED_COMMENT_KEYS.has(key)) extra[key] = value;
  }
  return {
    external_comment_id: Number(comment.id),
    author_zendesk_user_id: numberOrNull(comment.author_id),
    comment_type: stringOrNull(comment.type),
    audit_id: numberOrNull(comment.audit_id),
    body: stringOrNull(comment.body),
    html_body: stringOrNull(comment.html_body),
    plain_body: stringOrNull(comment.plain_body),
    is_public: comment.public !== false,
    attachments: Array.isArray(comment.attachments) ? comment.attachments : [],
    via: comment.via ?? null,
    metadata: comment.metadata ?? null,
    extra,
    external_created_at: comment.created_at,
  };
}

/** Mirror row → the provider comment object the UI has always received. */
export function mirrorRowToComment(row: MirrorCommentRow): ZendeskComment {
  return {
    ...row.extra,
    id: Number(row.external_comment_id),
    type: row.comment_type,
    author_id: row.author_zendesk_user_id ?? 0,
    body: row.body ?? '',
    html_body: row.html_body ?? undefined,
    plain_body: row.plain_body,
    public: row.is_public,
    attachments: row.attachments ?? [],
    audit_id: row.audit_id,
    via: row.via,
    metadata: row.metadata,
    created_at: row.external_created_at,
  };
}

/** The support_tickets columns promoted out of the provider ticket object. */
export interface MirrorTicketColumns {
  subject: string | null;
  status: string | null;
  requesterUserId: number | null;
  assigneeUserId: number | null;
  priority: string | null;
  ticketType: string | null;
  tags: string[];
  providerExternalId: string | null;
  externalCreatedAt: string | null;
  externalUpdatedAt: string | null;
}

export function ticketToMirrorColumns(ticket: ZendeskTicket): MirrorTicketColumns {
  return {
    subject: ticket.subject?.trim() || null,
    status: ticket.status ? String(ticket.status) : null,
    requesterUserId: numberOrNull(ticket.requester_id),
    assigneeUserId: numberOrNull(ticket.assignee_id),
    priority: ticket.priority ? String(ticket.priority) : null,
    ticketType: ticket.type ? String(ticket.type) : null,
    tags: Array.isArray(ticket.tags) ? ticket.tags.map(String) : [],
    providerExternalId: stringOrNull(ticket.external_id)?.trim() || null,
    externalCreatedAt: stringOrNull(ticket.created_at),
    externalUpdatedAt: stringOrNull(ticket.updated_at),
  };
}

/** A zendesk_users row as the mirror read returns it. */
export interface MirrorUserRow {
  zendesk_user_id: number;
  name: string | null;
  email: string | null;
  photo_url: string | null;
  role: string | null;
}

const AGENT_ROLES = new Set(['agent', 'admin']);

/** The assignable roster (agents + admins) out of the cached users, in id order. */
export function agentsFromUsers(users: ReadonlyArray<MirrorUserRow>): ZendeskAgent[] {
  return users
    .filter((u) => u.role != null && AGENT_ROLES.has(u.role))
    .sort((a, b) => Number(a.zendesk_user_id) - Number(b.zendesk_user_id))
    .map((u) => ({
      id: Number(u.zendesk_user_id),
      name: u.name || 'Agent',
      email: u.email ?? null,
      role: String(u.role),
      photo: u.photo_url ?? null,
    }));
}

/**
 * Attach author identity the way the live path did: the helpdesk user's
 * name/email/photo (+ whether they are an agent), then the Cycle Forge staffer
 * behind it — recorded post, staff email, then note sign-off (applyStaffAuthor).
 * A comment whose author is unknown locally is returned untouched.
 */
export function enrichMirrorComments(
  comments: ReadonlyArray<ZendeskComment>,
  ctx: {
    users: ReadonlyArray<MirrorUserRow>;
    byCommentId: Map<number, StaffAuthorHit>;
    byEmail: Map<string, StaffAuthorHit>;
    byName: Map<string, StaffAuthorHit>;
  },
): ZendeskComment[] {
  const usersById = new Map(ctx.users.map((u) => [Number(u.zendesk_user_id), u]));
  return comments.map((c) => {
    const user = usersById.get(c.author_id);
    const withUser = user
      ? {
          ...c,
          author_name: user.name ?? `User #${c.author_id}`,
          author_email: user.email ?? null,
          author_photo: user.photo_url ?? null,
          author_is_agent: user.role != null && AGENT_ROLES.has(user.role),
        }
      : c;
    return applyStaffAuthor(
      withUser as ZendeskComment & {
        author_email?: string | null;
        author_name?: string;
        author_photo?: string | null;
        author_staff_id?: number | null;
      },
      ctx.byCommentId,
      ctx.byEmail,
      ctx.byName,
    ) as ZendeskComment;
  });
}

/**
 * Page the (complete, oldest-first) mirrored thread. No page/perPage → the whole
 * thread with `next_page: null`. `next_page` is this route's own URL for the
 * following page, never a provider URL.
 */
export function pageMirrorComments(
  comments: ReadonlyArray<ZendeskComment>,
  opts: { ticketId: number; page?: number; perPage?: number },
): { comments: ZendeskComment[]; count: number; next_page: string | null } {
  const count = comments.length;
  if (opts.page == null && opts.perPage == null) {
    return { comments: [...comments], count, next_page: null };
  }
  const perPage = Math.min(100, Math.max(1, Math.floor(opts.perPage ?? 25)));
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const start = (page - 1) * perPage;
  const slice = comments.slice(start, start + perPage);
  const next_page =
    start + perPage < count
      ? `/api/zendesk/tickets/${opts.ticketId}/comments?page=${page + 1}&perPage=${perPage}`
      : null;
  return { comments: slice, count, next_page };
}
