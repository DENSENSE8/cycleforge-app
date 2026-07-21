import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { PackVerificationSubmitBody } from '@/lib/schemas/pack-verification';
import { recordPackVerificationEvent } from '@/lib/packing/pack-verification';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';

/**
 * POST /api/packing/verification — packer submits a floor-capture verification
 * outcome for a packer_log after the guided slip/box photos + tracking check
 * (docs/todo/packer-review-station-plan.md Phase 2d/3c). Append-only; the domain
 * helper enforces the outcome state machine (409 on an illegal transition) and
 * client_event_id idempotency. orgId + staffId come from the auth context.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(PackVerificationSubmitBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const result = await recordPackVerificationEvent({
      organizationId: ctx.organizationId,
      packerLogId: parsed.packerLogId,
      outcome: parsed.outcome,
      detectedTracking: parsed.detectedTracking ?? null,
      detectedOrderId: parsed.detectedOrderId ?? null,
      ocrConfidence: parsed.ocrConfidence ?? null,
      verifiedByStaffId: ctx.staffId,
      clientEventId: parsed.clientEventId ?? null,
      meta: parsed.meta ?? null,
    });

    if (!result.ok) {
      const status = result.code === 'NOT_FOUND' ? 404 : result.code === 'CONFLICT' ? 409 : 400;
      return NextResponse.json(
        { success: false, error: result.error, code: result.code, latest: result.latest ?? null },
        { status },
      );
    }

    // Audit the real state change only — an idempotent replay was already audited.
    if (!result.duplicate) {
      await recordAudit(pool, ctx, req, {
        source: 'pack-verification-api',
        action: AUDIT_ACTION.PACK_VERIFICATION,
        entityType: AUDIT_ENTITY.PACKER_LOG,
        entityId: parsed.packerLogId,
        after: { outcome: result.outcome, detectedTracking: parsed.detectedTracking ?? null },
      });
    }

    return NextResponse.json(
      { success: true, id: result.id, outcome: result.outcome, duplicate: result.duplicate },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (error: any) {
    console.error('Error in POST /api/packing/verification:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to record verification' },
      { status: 500 },
    );
  }
}, { permission: 'packing.complete_order' });
