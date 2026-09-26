import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { parseBody } from '@/lib/schemas/parse';
import { createPlatformTypeRule } from '@/lib/neon/catalog-queries';
import { getOrgPlatformTypeRules, invalidateCatalogCache } from '@/lib/catalog/org-catalog';
import { recordAudit } from '@/lib/audit-logs';
import pool from '@/lib/db';

/** GET /api/catalog/platform-type-rules — the org's platform → receiving-type dependency matrix. */
export const GET = withAuth(
  async (_req, ctx) => {
    const rules = await getOrgPlatformTypeRules(ctx.organizationId);
    return NextResponse.json({ success: true, rules });
  },
  { permission: 'receiving.view' },
);

/** `z.coerce` on the ids, deliberately: */
const RuleCreateBody = z.object({
  platformId: z.coerce.number().int().positive(),
  typeId: z.coerce.number().int().positive(),
  isDefault: z.boolean().optional(),
});

/** POST /api/catalog/platform-type-rules — allow one type on one platform. */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireRoutePerm(req, 'admin.manage_features');
    if (gate.denied) return gate.denied;

    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(RuleCreateBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const result = await createPlatformTypeRule(gate.ctx.organizationId, parsed);
    if (!result.ok) {
      return result.reason === 'exists'
        ? NextResponse.json({ success: false, error: 'That type is already allowed here' }, { status: 409 })
        : NextResponse.json({ success: false, error: 'Platform or type not found' }, { status: 404 });
    }

    await recordAudit(pool, gate.ctx, req, {
      source: 'catalog-api',
      action: 'catalog.platform_type_rule.create',
      entityType: 'catalog_platform_type_rule',
      entityId: result.id,
      after: { ...parsed },
    });

    invalidateCatalogCache(gate.ctx.organizationId);
    return NextResponse.json({ success: true, id: result.id }, { status: 201 });
  } catch (error: any) {
    console.error('Error in POST /api/catalog/platform-type-rules:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to add rule' },
      { status: 500 },
    );
  }
}
