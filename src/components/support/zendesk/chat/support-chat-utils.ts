import type { ZendeskAgent, ZendeskComment, ZendeskTicket, ZendeskUser } from '@/lib/zendesk';

/**
 * Best-effort requester identity. Email-channel tickets carry the customer on
 * `via.source.from.{name,address}` (the same field the dashboard overview uses);
 * there's no separate end-user fetch, so we read it off the ticket.
 */
export function requesterFrom(ticket: ZendeskTicket): { name: string | null; email: string | null } {
  const via = (ticket as { via?: { source?: { from?: { name?: string; address?: string } } } }).via;
  const from = via?.source?.from;
  return { name: from?.name ?? null, email: from?.address ?? null };
}

export function requesterLabel(ticket: ZendeskTicket): string {
  const r = requesterFrom(ticket);
  return r.name || r.email || 'Requester';
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

export interface ResolvedAuthor {
  /** Best display name (staff name, agent/user name, or the requester label). */
  name: string;
  /** The author's email when known (from the agent/user roster) — never an id. */
  email: string | null;
  /** Zendesk roster photo — used only when there is no Cycle Forge staff id. */
  photo: string | null;
  /** Cycle Forge staff id when this comment was posted by (or maps to) our staff. */
  staffId: number | null;
  /** True when this comment is one of OURS (agent reply or any internal note). */
  isOurs: boolean;
}

/** Resolve a comment author. */
export function resolveAuthor(
  c: ZendeskComment,
  maps: {
    agentsById: Map<number, ZendeskAgent>;
    usersById: Map<number, ZendeskUser>;
    requesterId?: number;
    requesterName?: string | null;
    requesterEmail?: string | null;
  },
): ResolvedAuthor {
  const agent = maps.agentsById.get(c.author_id);
  const user = maps.usersById.get(c.author_id);
  const optimisticOurs = (c as { __ours?: boolean }).__ours === true;

  // Prefer identity the comments route already resolved server-side (from the
  // zendesk_users cache + agent roster) — present on first paint, so no flicker.
  const server = c as {
    author_name?: string;
    author_email?: string | null;
    author_photo?: string | null;
    author_is_agent?: boolean;
    author_staff_id?: number | null;
  };
  const staffId =
    typeof server.author_staff_id === 'number' && server.author_staff_id > 0
      ? server.author_staff_id
      : null;

  if (server.author_name) {
    return {
      name: server.author_name,
      email: server.author_email ?? null,
      photo: staffId ? null : server.author_photo ?? null,
      staffId,
      isOurs: Boolean(server.author_is_agent) || Boolean(staffId) || c.public === false || optimisticOurs,
    };
  }

  const isOurs = Boolean(agent) || Boolean(staffId) || c.public === false || optimisticOurs;

  if (staffId) {
    return {
      name: agent?.name || user?.name || 'Staff',
      email: agent?.email ?? user?.email ?? null,
      photo: null,
      staffId,
      isOurs,
    };
  }

  if (agent) {
    return { name: agent.name, email: agent.email, photo: agent.photo, staffId: null, isOurs };
  }
  if (user) {
    return {
      name: user.name || user.email || 'User',
      email: user.email,
      photo: user.photo,
      staffId: null,
      isOurs,
    };
  }
  if (maps.requesterId && c.author_id === maps.requesterId) {
    const name = maps.requesterName || maps.requesterEmail || 'Requester';
    return { name, email: maps.requesterEmail ?? null, photo: null, staffId: null, isOurs };
  }
  if (optimisticOurs) {
    return { name: 'You', email: null, photo: null, staffId: null, isOurs };
  }
  return { name: `User #${c.author_id}`, email: null, photo: null, staffId: null, isOurs };
}

/**
 * How far off the bottom still counts as "reading the newest message" when the
 * floating composer resizes. One card of slack — tighter and a half-scrolled
 * pixel breaks the dock; looser and it yanks a reader who moved up on purpose.
 */
export const STREAM_AT_END_SLACK_PX = 96;

/** Is the conversation port parked at the newest message? */
export function isConversationAtEnd(
  port: Pick<HTMLElement, 'scrollHeight' | 'scrollTop' | 'clientHeight'>,
  slackPx: number = STREAM_AT_END_SLACK_PX,
): boolean {
  return port.scrollHeight - port.scrollTop - port.clientHeight <= slackPx;
}
