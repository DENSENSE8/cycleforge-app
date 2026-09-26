import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { parseBody } from '@/lib/schemas/parse';
import {
  deletePlatformTypeRule,
  setPlatformTypeRuleDefault,
} from '@/lib/neon/catalog-queries';
import { invalidateCatalogCache } from '@/lib/catalog/org-catalog';
import { recordAudit } from '@/lib/audit-logs';
import pool from '@/lib/db';

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

const RuleUpdateBody = z.object({ isDefault: z.boolean() });

/** PATCH /api/catalog/platform-type-rules/[id] — make this the platform's pre-selected type (or clear that flag). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireRoutePerm(req, 'admin.manage_features');
    if (gate.denied) return gate.denied;
    const { id: rawId } = await params;
    const id = parseId(rawId);
    if (id == null) return NextResponse.json({ success: false, error: 'Invalid ID' }, { status: 400 });

    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(RuleUpdateBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const ok = await setPlatformTypeRuleDefault(gate.ctx.organizationId, id, parsed.isDefault);
    if (!ok) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    await recordAudit(pool, gate.ctx, req, {
      source: 'catalog-api',
      action: 'catalog.platform_type_rule.update',
      entityType: 'catalog_platform_type_rule',
      entityId: id,
      after: { isDefault: parsed.isDefault },
    });

    invalidateCatalogCache(gate.ctx.organizationId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in PATCH /api/catalog/platform-type-rules/[id]:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update rule' },
      { status: 500 },
    );
  }
}

/** DELETE /api/catalog/platform-type-rules/[id] — stop allowing this type here. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireRoutePerm(req, 'admin.manage_features');
    if (gate.denied) return gate.denied;
    const { id: rawId } = await params;
    const id = parseId(rawId);
    if (id == null) return NextResponse.json({ success: false, error: 'Invalid ID' }, { status: 400 });

    const ok = await deletePlatformTypeRule(gate.ctx.organizationId, id);
    if (!ok) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    await recordAudit(pool, gate.ctx, req, {
      source: 'catalog-api',
      action: 'catalog.platform_type_rule.delete',
      entityType: 'catalog_platform_type_rule',
      entityId: id,
    });

    invalidateCatalogCache(gate.ctx.organizationId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in DELETE /api/catalog/platform-type-rules/[id]:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete rule' },
      { status: 500 },
    );
  }
}
