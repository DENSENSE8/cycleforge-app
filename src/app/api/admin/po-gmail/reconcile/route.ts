/** GET /api/admin/po-gmail/reconcile */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { runPoMailboxReconcile, DEFAULT_LIMIT } from '@/lib/po-gmail/reconcile-run';
import { PoGmailNotConnectedError } from '@/lib/po-gmail/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const url = new URL(req.url);
    const limitRaw = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT);
    const query = url.searchParams.get('q') ?? 'is:unread';
    const persist = url.searchParams.get('persist') !== 'false'; // default true

    const result = await runPoMailboxReconcile({
      limit: limitRaw,
      query,
      persist,
      orgId: ctx.organizationId,
    });
    return NextResponse.json(result);
  } catch (error) {
    // A revoked/expired Gmail token (the common weekly failure) is not a 500 —
    // surface it as a 409 with a reconnect flag so the UI prompts to reconnect
    // instead of telling the operator to "try again".
    if (error instanceof PoGmailNotConnectedError) {
      return NextResponse.json(
        { error: error.message, needs_reconnect: error.needsReconnect },
        { status: 409 },
      );
    }
    return errorResponse(error, 'GET /api/admin/po-gmail/reconcile');
  }
}, { permission: 'admin.view' });
