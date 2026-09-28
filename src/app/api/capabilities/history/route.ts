/** GET /api/capabilities/history — the org's build history (org_capability_events), newest first. */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { listCapabilityEvents } from '@/lib/capabilities/store';
import type { CapabilityHistoryResponse } from '@/lib/capabilities/api-shape';
import type { OrgId } from '@/lib/tenancy/constants';

export const dynamic = 'force-dynamic';

const PAGE = 100;

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const before = Number(new URL(req.url).searchParams.get('before')) || null;
    const events = await listCapabilityEvents(ctx.organizationId as OrgId, { limit: PAGE, before });
    const body: CapabilityHistoryResponse = {
      events,
      nextBefore: events.length === PAGE ? events[events.length - 1]!.id : null,
    };
    return NextResponse.json(body);
  } catch (error) {
    return errorResponse(error, 'GET /api/capabilities/history');
  }
}, { permission: 'admin.view' });
