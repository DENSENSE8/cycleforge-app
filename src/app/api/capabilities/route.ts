/**
 * /api/capabilities — the org's capabilities (SIMPLE-FIRST, docs/product/SIMPLE-FIRST.md).
 *
 * GET  every unlockable capability with this org's state (the chat-first home
 *      chips and Settings → Capabilities read it).
 * POST turn one on / off from Settings (`source: 'settings'`); the ledger row
 *      and the sidebar repaint come from the domain helper.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { parseBody } from '@/lib/schemas/parse';
import { CapabilitySwitchBody } from '@/lib/schemas/capabilities';
import { BASE_CAPABILITY_ID, getCapability } from '@/lib/capabilities/catalog';
import { loadCapabilityViews, switchCapabilityFromSettings } from '@/lib/capabilities/store';
import type { CapabilitiesResponse } from '@/lib/capabilities/api-shape';
import type { OrgId } from '@/lib/tenancy/constants';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (_req: NextRequest, ctx) => {
  try {
    const views = await loadCapabilityViews(ctx.organizationId as OrgId);
    const body: CapabilitiesResponse = {
      capabilities: views.map((v) => ({
        id: v.def.id,
        label: v.def.label,
        blurb: v.def.blurb,
        state: v.state,
        source: v.row?.source ?? null,
        enabledBy: v.row?.enabledByName ?? null,
        enabledAt: v.row?.enabledAt ?? null,
        landingPath: v.def.landingPath,
        prerequisites: v.prerequisites,
      })),
    };
    return NextResponse.json(body);
  } catch (error) {
    return errorResponse(error, 'GET /api/capabilities');
  }
}, { permission: 'assistant.chat' });

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const parsed = parseBody(CapabilitySwitchBody, await req.json().catch(() => ({})));
    if (parsed instanceof NextResponse) return parsed;
    const def = getCapability(parsed.capabilityId);
    if (!def || def.id === BASE_CAPABILITY_ID) {
      return NextResponse.json({ success: false, error: 'UNKNOWN_CAPABILITY' }, { status: 404 });
    }
    const moved = await switchCapabilityFromSettings(ctx.organizationId as OrgId, def.id, parsed.enable, ctx.staffId);
    if (moved.changed) {
      await recordAudit(pool, ctx, req, {
        source: 'capabilities-api',
        action: parsed.enable ? AUDIT_ACTION.ORG_CAPABILITY_ENABLE : AUDIT_ACTION.ORG_CAPABILITY_DISABLE,
        entityType: AUDIT_ENTITY.ORG_CAPABILITY,
        entityId: def.id,
        before: { state: moved.fromState },
        after: { state: moved.toState },
      });
    }
    return NextResponse.json({ success: true, capabilityId: def.id, ...moved });
  } catch (error) {
    return errorResponse(error, 'POST /api/capabilities');
  }
}, { permission: 'admin.manage_features' });
