/**
 * GET /api/integrations/composio/connections
 *
 * Connection state for the SIGNED-IN staffer's own outside accounts. Exists
 * for one reason: after the operator authorizes in the popup, the in-chat
 * connect pill polls this to flip itself from "Connect" to "Connected" without
 * a page reload and without the model being asked again.
 *
 * The identity is the session's, never the query string — a caller cannot ask
 * about somebody else's connections.
 */

import { NextResponse } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';
import { isComposioConfigured, invalidateComposioSession } from '@/lib/integrations/composio/client';
import { listConnectionStatus } from '@/lib/integrations/composio/connections';

export const runtime = 'nodejs';

export const GET = withAuth(
  async (req, ctx: AuthContext) => {
    if (!isComposioConfigured()) {
      return NextResponse.json({ configured: false, apps: [] });
    }
    const actor = { organizationId: ctx.organizationId, staffId: ctx.staffId };
    // The pill polls DURING an authorization, so a cached session would report
    // the pre-connect state for its whole TTL and the pill would never flip.
    if (new URL(req.url).searchParams.get('fresh') === '1') invalidateComposioSession(actor);
    const apps = await listConnectionStatus(actor);
    return NextResponse.json({
      configured: true,
      apps: apps.map(({ toolkit, label, connected }) => ({ app: toolkit, label, connected })),
    });
  },
  { permission: 'integrations.google.read' },
);
