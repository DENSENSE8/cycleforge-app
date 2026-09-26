import { NextRequest, NextResponse } from 'next/server';
import { ApiError, errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { ZendeskApiError, ZendeskNotConfiguredError, type ZendeskUser } from '@/lib/zendesk';
import {
  getHelpdeskProvider,
  HELPDESK_CONNECT_HINT,
  HELPDESK_NOT_CONNECTED_MESSAGE,
} from '@/lib/integrations/helpdesk';
import { getCachedUsers, upsertCachedUsers } from '@/lib/zendesk-users-cache';

export const dynamic = 'force-dynamic';

/** Zendesk users batch lookup. */

function notConfigured(context: string): NextResponse {
  return errorResponse(
    new ApiError(503, HELPDESK_NOT_CONNECTED_MESSAGE, HELPDESK_CONNECT_HINT),
    context,
  );
}

function mapZendeskError(err: unknown, context: string): NextResponse {
  if (err instanceof ZendeskNotConfiguredError) return notConfigured(context);
  if (err instanceof ZendeskApiError) {
    const status = err.status >= 400 && err.status < 600 ? err.status : 502;
    return errorResponse(new ApiError(status, 'Zendesk API error', err.message), context);
  }
  return errorResponse(err, context);
}

export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const context = 'GET /api/zendesk/users';
    try {
      const helpdesk = await getHelpdeskProvider(ctx.organizationId);
      if (!helpdesk || !(await helpdesk.isConfigured())) return notConfigured(context);

      const ids = (req.nextUrl.searchParams.get('ids') ?? '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);

      if (!ids.length) return NextResponse.json({ success: true, users: [] });

      // Cache-first: serve known users from the DB, fetch only the misses from
      // Zendesk, then upsert so the next caller (and the comments route) is warm.
      const cached = await getCachedUsers(ctx.organizationId, ids);
      const missing = ids.filter((id) => !cached.has(id));
      let fetched: ZendeskUser[] = [];
      if (missing.length) {
        fetched = await helpdesk.getUsers(missing);
        if (fetched.length) await upsertCachedUsers(ctx.organizationId, fetched);
      }

      const users: ZendeskUser[] = [
        ...Array.from(cached.values()).map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role ?? 'end-user',
          photo: u.photo,
        })),
        ...fetched,
      ];
      return NextResponse.json({ success: true, users });
    } catch (err) {
      return mapZendeskError(err, context);
    }
  },
  { permission: 'integrations.zendesk', feature: 'support' },
);
