/**
 * Server-side ticket bundle loader — one coordinated read for the support detail
 * panel (ticket + enriched comments + agents + staff assignment + linked photos).
 */
import type { OrgId } from '@/lib/tenancy/constants';
import type { ZendeskAgent, ZendeskComment, ZendeskTicket } from '@/lib/zendesk';
import { getTicketAssignment, type TicketAssignment } from '@/lib/zendesk-assignments';
import { getEntityPhotos, getTicketEntity } from '@/lib/zendesk-links';
import { enrichCommentAuthors } from './enrich-comment-authors';
import { getOrSetZendeskBundle } from './zendesk-ticket-cache';
import type { HelpdeskProvider } from './types';

export interface ZendeskLinkedEntity {
  type: string;
  id: number;
  source: string;
}

export interface ZendeskTicketPhoto {
  id: number;
  url: string;
  caption?: string | null;
  [key: string]: unknown;
}

export interface ZendeskTicketBundle {
  ticket: ZendeskTicket;
  comments: ZendeskComment[];
  commentsCount: number;
  commentsNextPage: string | null;
  agents: ZendeskAgent[];
  assignment: TicketAssignment | null;
  entity: ZendeskLinkedEntity | null;
  photos: ZendeskTicketPhoto[];
}

async function loadZendeskTicketBundleFresh(
  orgId: OrgId,
  ticketId: number,
  helpdesk: HelpdeskProvider,
): Promise<ZendeskTicketBundle> {
  const [ticket, commentResult, agents, assignment, entity] = await Promise.all([
    helpdesk.getTicket(ticketId),
    helpdesk.listComments(ticketId),
    helpdesk.listAgents(false).catch(() => [] as ZendeskAgent[]),
    getTicketAssignment(orgId, ticketId),
    getTicketEntity(orgId, ticketId),
  ]);

  if (!ticket) {
    throw Object.assign(new Error('Zendesk ticket not found'), { status: 404 });
  }

  const comments = await enrichCommentAuthors(orgId, helpdesk, commentResult.comments);
  const photos = entity ? await getEntityPhotos(orgId, entity) : [];

  return {
    ticket,
    comments,
    commentsCount: commentResult.count,
    commentsNextPage: commentResult.next_page,
    agents,
    assignment,
    entity: entity
      ? { type: entity.type, id: entity.id, source: entity.source }
      : null,
    // EntityPhoto is a structural superset of ZendeskTicketPhoto (same id/url/
    // caption plus takenByStaffId/createdAt); only the index-signature nominal
    // mismatch blocks a direct cast. Widen through unknown — runtime shape is
    // unchanged (the full EntityPhoto objects are returned as before).
    photos: photos as unknown as ZendeskTicketPhoto[],
  };
}

export async function loadZendeskTicketBundle(
  orgId: OrgId,
  ticketId: number,
  helpdesk: HelpdeskProvider,
  opts: { bypassCache?: boolean } = {},
): Promise<ZendeskTicketBundle> {
  if (opts.bypassCache) {
    return loadZendeskTicketBundleFresh(orgId, ticketId, helpdesk);
  }
  return getOrSetZendeskBundle(orgId, ticketId, () =>
    loadZendeskTicketBundleFresh(orgId, ticketId, helpdesk),
  );
}
