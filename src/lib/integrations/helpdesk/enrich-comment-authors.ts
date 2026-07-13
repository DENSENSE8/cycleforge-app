/**
 * Attach author identity to Zendesk comments server-side (agents roster +
 * zendesk_users DB cache). Shared by the comments route and ticket bundle loader.
 */
import { after } from 'next/server';
import type { OrgId } from '@/lib/tenancy/constants';
import type { ZendeskComment } from '@/lib/zendesk';
import { getCachedUsers, upsertCachedUsers } from '@/lib/zendesk-users-cache';
import type { HelpdeskProvider } from './types';

export async function enrichCommentAuthors(
  organizationId: OrgId,
  helpdesk: HelpdeskProvider,
  comments: ZendeskComment[],
): Promise<ZendeskComment[]> {
  const ids = Array.from(new Set(comments.map((c) => c.author_id).filter((n) => n > 0)));
  if (!ids.length) return comments;

  const [agents, cached] = await Promise.all([
    helpdesk.listAgents(false).catch(() => []),
    getCachedUsers(organizationId, ids),
  ]);
  const agentsById = new Map(agents.map((a) => [a.id, a]));

  const enriched = comments.map((c) => {
    const agent = agentsById.get(c.author_id);
    const user = cached.get(c.author_id);
    const src = agent ?? user;
    if (!src) return c;
    return {
      ...c,
      author_name: src.name,
      author_email: src.email ?? null,
      author_photo: src.photo ?? null,
      author_is_agent: Boolean(agent),
    } as ZendeskComment;
  });

  const missing = ids.filter((id) => !agentsById.has(id) && !cached.has(id));
  if (missing.length) {
    after(async () => {
      try {
        const fetched = await helpdesk.getUsers(missing);
        if (fetched.length) await upsertCachedUsers(organizationId, fetched);
      } catch (err) {
        console.warn('[helpdesk] comment author backfill failed', err);
      }
    });
  }

  return enriched;
}
