/** GET /api/surfaces/:key/resolve — how should this operator surface render for the caller's org, right now? */

import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { isSurfaceKey } from '@/lib/stations/surface-keys';
import { resolveSurface } from '@/lib/stations/surface-resolver';
import { isSurfaceComposedRender } from '@/lib/feature-flags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, routeCtx: { params: Promise<{ key: string }> }) {
  const gate = await requireRoutePerm(req, 'dashboard.view');
  if (gate.denied) return gate.denied;
  const orgId = gate.ctx.organizationId;

  const { key } = await routeCtx.params;
  if (!isSurfaceKey(key)) {
    return NextResponse.json({ error: 'UNKNOWN_SURFACE' }, { status: 404 });
  }

  const resolved = await resolveSurface(key, orgId);
  // Composed rendering requires an active composition AND the per-org flag.
  const flagOn = await isSurfaceComposedRender(orgId);
  const render = resolved.render === 'composed' && flagOn ? 'composed' : 'legacy';

  return NextResponse.json({
    success: true,
    key: resolved.key,
    archetype: resolved.archetype,
    render,
    pageKey: resolved.surface.pageKey,
    modeKey: resolved.surface.modeKey,
    definition: render === 'composed' ? resolved.definition : null,
  });
}
