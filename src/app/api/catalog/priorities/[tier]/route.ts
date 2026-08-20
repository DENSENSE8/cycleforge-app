import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { parseBody } from '@/lib/schemas/parse';
import { PriorityTierUpdateBody } from '@/lib/schemas/catalog';
import {
  deletePriorityTier,
  getPriorityTier,
  upsertPriorityTier,
} from '@/lib/neon/catalog-queries';
import { invalidateCatalogCache } from '@/lib/catalog/org-catalog';
import { priorityOverrideTier } from '@/lib/receiving/priority-override';
import { recordAudit } from '@/lib/audit-logs';
import pool from '@/lib/db';

/**
 * The path segment is a TIER (0..3), not a row id.
 *
 * Its siblings address `/[id]` because a platform or type row is the thing
 * itself. Here the thing is a rung of a fixed ladder and the row is an optional
 * skin over it, so the row may not exist when the first edit arrives. Keying
 * the URL on tier makes that first write an upsert instead of forcing the
 * client to create-then-update.
 */
function parseTier(raw: string): number | null {
  const tier = Number(raw);
  return Number.isInteger(tier) && tier >= 0 && tier <= 3 ? tier : null;
}

/** PATCH /api/catalog/priorities/[tier] — rename / repaint one rung. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tier: string }> }) {
  try {
    const gate = await requireRoutePerm(req, 'admin.manage_features');
    if (gate.denied) return gate.denied;
    const { tier: rawTier } = await params;
    const tier = parseTier(rawTier);
    if (tier == null) {
      return NextResponse.json(
        { success: false, error: 'Invalid tier — the ladder is 0..3' },
        { status: 400 },
      );
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(PriorityTierUpdateBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    // The built-in rung is both the validity check and the source of defaults:
    // a first-time write of only `colorHex` still needs a label + short to land
    // a complete row, and they must be the ones the operator was looking at.
    const builtin = priorityOverrideTier(tier);
    if (!builtin) {
      return NextResponse.json({ success: false, error: 'Unknown priority tier' }, { status: 404 });
    }

    const before = await getPriorityTier(gate.ctx.organizationId, tier);

    const data: { label?: string; short?: string; colorHex?: string | null } = {
      label: parsed.label,
      short: parsed.short,
    };
    // Only forward colorHex when the client sent it, so the query can tell
    // "clear to the built-in tone" (null) from "leave unchanged" (absent).
    if (Object.prototype.hasOwnProperty.call(parsed, 'colorHex')) {
      data.colorHex = parsed.colorHex == null ? null : parsed.colorHex.toLowerCase();
    }

    const updated = await upsertPriorityTier(gate.ctx.organizationId, tier, data, {
      label: builtin.label,
      short: builtin.short,
    });

    await recordAudit(pool, gate.ctx, req, {
      source: 'catalog-api',
      action: 'catalog.priority.update',
      entityType: 'catalog_priority_tier',
      entityId: updated?.id ?? tier,
      before: before ? { ...before } : null,
      after: updated ? { ...updated } : null,
    });

    invalidateCatalogCache(gate.ctx.organizationId);
    return NextResponse.json({ success: true, priority: updated });
  } catch (error: any) {
    console.error('Error in PATCH /api/catalog/priorities/[tier]:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update priority tier' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/catalog/priorities/[tier] — reset the rung to its built-in
 * label / short / tone.
 *
 * A hard DELETE, unlike the soft `is_active = false` its siblings use: absence
 * of a row IS the default state here, so removing the override restores the
 * built-in exactly. The rung itself never goes away, and no carton is stranded
 * — `receiving.priority_tier` still holds the same number either way.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ tier: string }> }) {
  try {
    const gate = await requireRoutePerm(req, 'admin.manage_features');
    if (gate.denied) return gate.denied;
    const { tier: rawTier } = await params;
    const tier = parseTier(rawTier);
    if (tier == null) {
      return NextResponse.json(
        { success: false, error: 'Invalid tier — the ladder is 0..3' },
        { status: 400 },
      );
    }

    const before = await getPriorityTier(gate.ctx.organizationId, tier);
    if (!before) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    await deletePriorityTier(gate.ctx.organizationId, tier);

    await recordAudit(pool, gate.ctx, req, {
      source: 'catalog-api',
      action: 'catalog.priority.reset',
      entityType: 'catalog_priority_tier',
      entityId: before.id,
      before: { ...before },
      after: null,
    });

    invalidateCatalogCache(gate.ctx.organizationId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in DELETE /api/catalog/priorities/[tier]:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to reset priority tier' },
      { status: 500 },
    );
  }
}
