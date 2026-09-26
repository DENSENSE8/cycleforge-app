import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { isCapability } from '@/lib/integrations/capability-labels';
import {
  connectedProviderKey,
  connectedProviderLabel,
} from '@/lib/integrations/capability-connections';

export const dynamic = 'force-dynamic';

/** GET /api/integrations/capability-label?cap=helpdesk */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const cap = (req.nextUrl.searchParams.get('cap') ?? '').trim();
    if (!isCapability(cap)) {
      return NextResponse.json({ success: false, error: 'Unknown capability' }, { status: 400 });
    }
    const [label, providerKey] = await Promise.all([
      connectedProviderLabel(ctx.organizationId, cap),
      connectedProviderKey(ctx.organizationId, cap),
    ]);
    return NextResponse.json({ success: true, label, providerKey });
  } catch (err) {
    return errorResponse(err, 'GET /api/integrations/capability-label');
  }
});
