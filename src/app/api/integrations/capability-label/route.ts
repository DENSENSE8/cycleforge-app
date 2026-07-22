import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { isCapability } from '@/lib/integrations/capability-labels';
import {
  connectedProviderKey,
  connectedProviderLabel,
} from '@/lib/integrations/capability-connections';

export const dynamic = 'force-dynamic';

/**
 * GET /api/integrations/capability-label?cap=helpdesk
 *
 * The runtime DISPLAY name of the org's connected provider for a capability
 * (e.g. "Zendesk", or a customer's own helpdesk) + its provider key. Powers
 * vendor-neutral deep-link labels ("Open in <provider>") on product surfaces via
 * the `useCapabilityProviderLabel` hook — so operator copy never hardcodes a
 * vendor brand (AGENTS.md → Integrations).
 *
 * Read-only, org-scoped. No special permission: it returns only a display label
 * derived from the org's own connection, nothing sensitive. (A permission-less
 * GET is allowed by the route-auth audit — only non-GET no-permission routes are
 * flagged.)
 */
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
