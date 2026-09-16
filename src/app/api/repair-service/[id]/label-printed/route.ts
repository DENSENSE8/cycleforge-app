import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { markRepairLabelPrinted } from '@/lib/neon/repair-service-queries';
import { publishRepairChanged } from '@/lib/realtime/publish';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

/**
 * POST /api/repair-service/[id]/label-printed — stamp the first print of the
 * 2×1 REP-{id} internal-insurance label (printRepairLabel).
 *
 * Stamps `label_printed_at` ONLY when NULL (a reprint never moves the
 * first-print instant), so the call is idempotent by construction. Audited and
 * realtime-published so the "Needs label" queue drops the row live.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'repair.intake');
    if (gate.denied) return gate.denied;
    const { id } = await params;
    const repairId = parseId(id);
    if (repairId == null) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

    const result = await markRepairLabelPrinted(repairId, gate.ctx.organizationId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    await invalidateCacheTags(['repair-service']);
    await publishRepairChanged({
      organizationId: gate.ctx.organizationId,
      repairIds: [repairId],
      source: 'repair.label-printed',
    });
    await recordAudit(pool, gate.ctx, req, {
      source: 'repair-service-api',
      action: AUDIT_ACTION.REPAIR_SERVICE_LABEL_PRINTED,
      entityType: AUDIT_ENTITY.REPAIR_SERVICE,
      entityId: repairId,
      extra: { alreadyPrinted: result.alreadyPrinted },
    });

    return NextResponse.json({
      success: true,
      labelPrintedAt: result.repair.label_printed_at ?? null,
      alreadyPrinted: result.alreadyPrinted,
    });
  } catch (error: any) {
    console.error('Error in POST /api/repair-service/[id]/label-printed:', error);
    return NextResponse.json(
      { error: 'Failed to mark label printed', details: error.message },
      { status: 500 },
    );
  }
}
