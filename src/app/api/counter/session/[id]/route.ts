/**
 * GET /api/counter/session/{id} — the full desk snapshot.
 *
 * The desk sees everything: voided lines, the lease holder, internal notes.
 * The device-facing projection is a different route on a different door
 * (`/api/kiosk/session`) — never a query flag on this one, because a flag is a
 * thing a caller can forget and this one leaks a customer's data if they do.
 */

import { NextRequest } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';
import { getSession } from '@/lib/counter/session-store';
import { deskSnapshot, sessionIdFromPath } from '@/lib/counter/session-http';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

export const GET = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const sessionId = sessionIdFromPath(req.nextUrl.pathname);
    if (sessionId === null) {
      return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }
    return deskSnapshot(await getSession(ctx.organizationId as OrgId, sessionId));
  },
  { permission: 'walk_in.view' },
);
