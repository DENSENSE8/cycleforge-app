/**
 * Where Composio returns the operator after they authorize an app.
 *
 * Composio appends `status` and `connected_account_id` to whatever callback
 * URL was handed to `session.authorize()`. This handler exists to do two
 * things and nothing else: drop the now-stale cached session so the next tool
 * call sees the live connection, and put the person back on the assistant
 * surface with a seeded question rather than on a bare JSON body.
 *
 * It deliberately does NOT trust the query string as authorization. The
 * connection lives in Composio against `<orgId>:<staffId>`; this route only
 * invalidates a cache entry for the CALLER's own identity, so a forged
 * `connected_account_id` grants nothing.
 */

import { NextResponse } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';
import {
  COMPOSIO_TOOLKIT_LABELS,
  type ComposioToolkit,
  invalidateComposioSession,
} from '@/lib/integrations/composio/client';

export const runtime = 'nodejs';

export const GET = withAuth(
  async (req, ctx: AuthContext) => {
    const url = new URL(req.url);
    const toolkit = url.searchParams.get('toolkit') as ComposioToolkit | null;
    const ok = url.searchParams.get('status') !== 'failed';

    invalidateComposioSession({ organizationId: ctx.organizationId, staffId: ctx.staffId });

    const label = toolkit ? (COMPOSIO_TOOLKIT_LABELS[toolkit] ?? toolkit) : 'the app';
    const back = new URL('/', url.origin);
    back.searchParams.set('connected', ok ? (toolkit ?? 'app') : 'failed');
    back.searchParams.set('connectedLabel', label);
    return NextResponse.redirect(back);
  },
  { permission: 'integrations.google.connect' },
);
