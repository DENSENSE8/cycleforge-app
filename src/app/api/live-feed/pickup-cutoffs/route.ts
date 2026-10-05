import { NextRequest, NextResponse } from 'next/server';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { withAuth } from '@/lib/auth/withAuth';
import pool from '@/lib/db';
import { listPickupCarrierChoices, listPickupCutoffs, replacePickupCutoffs } from '@/lib/live-feed/pickup-cutoffs';
import { parseBody } from '@/lib/schemas/parse';
import { ReplacePickupCutoffsBody } from '@/lib/schemas/pickup-cutoffs';

/**
 * GET /api/live-feed/pickup-cutoffs — every carrier × weekday pickup cutoff,
 * plus the carriers the editor offers (recent shipments ∪ configured).
 */
export const GET = withAuth(
  async (_req, ctx) => {
    const [cutoffs, carriers] = await Promise.all([
      listPickupCutoffs(ctx.organizationId),
      listPickupCarrierChoices(ctx.organizationId),
    ]);
    return NextResponse.json({ cutoffs, carriers }, { headers: { 'Cache-Control': 'no-store' } });
  },
  { permission: 'packing.view' },
);

/**
 * PUT /api/live-feed/pickup-cutoffs — replace the org's whole cutoff set
 * `{ cutoffs: [{ carrier, weekday: 0–6 (0 = Sunday), cutoffLocal: 'HH:MM' }] }`.
 * Org configuration, so the settings-registry write gate.
 */
export const PUT = withAuth(
  async (req: NextRequest, ctx) => {
    const parsed = parseBody(ReplacePickupCutoffsBody, await req.json().catch(() => null));
    if (parsed instanceof NextResponse) return parsed;

    const { before, after } = await replacePickupCutoffs(ctx.organizationId, ctx.staffId, parsed.cutoffs);

    await recordAudit(pool, ctx, req, {
      source: 'pickup-cutoffs-api',
      action: AUDIT_ACTION.CARRIER_PICKUP_CUTOFFS_REPLACE,
      entityType: AUDIT_ENTITY.CARRIER_PICKUP_CUTOFFS,
      entityId: ctx.organizationId,
      before: { cutoffs: before },
      after: { cutoffs: after },
    });

    return NextResponse.json({ cutoffs: after });
  },
  { permission: 'admin.manage_features' },
);
