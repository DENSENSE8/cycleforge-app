/** GET /api/inbox — the signed-in staffer's notification feed. */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { isHomeInbox } from '@/lib/feature-flags';
import { getInboxFeed, type InboxFilter } from '@/lib/notifications/inbox';

export const dynamic = 'force-dynamic';

const FILTERS: readonly InboxFilter[] = ['active', 'unread', 'done', 'snoozed'];

function parseFilter(raw: string | null): InboxFilter {
  return FILTERS.includes(raw as InboxFilter) ? (raw as InboxFilter) : 'active';
}

export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    if (!(await isHomeInbox(ctx.organizationId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const limitRaw = Number(req.nextUrl.searchParams.get('limit'));
    const feed = await getInboxFeed({
      orgId: ctx.organizationId,
      staffId: ctx.staffId,
      permissions: [...ctx.permissions],
      filter: parseFilter(req.nextUrl.searchParams.get('filter')),
      limit: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined,
    });

    return NextResponse.json(feed);
  },
  { permission: 'home.inbox.view' },
);
