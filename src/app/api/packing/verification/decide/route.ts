import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { PackVerificationDecideBody } from '@/lib/schemas/pack-verification';
import { recordPackVerificationEvent } from '@/lib/packing/pack-verification';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';

/**
 * POST /api/packing/verification/decide — manager approves or flags a packed
 * order from the Review station (docs/todo/packer-review-station-plan.md §4c).
 * REVIEW_APPROVED / REVIEW_FLAGGED are only legal when the latest outcome is
 * VERIFIED or an ERROR_* (the helper's state machine → 409 otherwise); a flag
 * requires a note. Append-only + idempotent. Gated on `packing.review`.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(PackVerificationDecideBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const result = await recordPackVerificationEvent({
      organizationId: ctx.organizationId,
      packerLogId: parsed.packerLogId,
      outcome: parsed.outcome,
      reviewNote: parsed.note ?? null,
      verifiedByStaffId: ctx.staffId,
      clientEventId: parsed.clientEventId ?? null,
    });

    if (!result.ok) {
      const status = result.code === 'NOT_FOUND' ? 404 : result.code === 'CONFLICT' ? 409 : 400;
      return NextResponse.json(
        { success: false, error: result.error, code: result.code, latest: result.latest ?? null },
        { status },
      );
    }

    if (!result.duplicate) {
      await recordAudit(pool, ctx, req, {
        source: 'pack-verification-api',
        action: AUDIT_ACTION.PACK_REVIEW_DECISION,
        entityType: AUDIT_ENTITY.PACKER_LOG,
        entityId: parsed.packerLogId,
        after: { outcome: result.outcome, note: parsed.note ?? null },
      });
    }

    return NextResponse.json(
      { success: true, id: result.id, outcome: result.outcome, duplicate: result.duplicate },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (error: any) {
    console.error('Error in POST /api/packing/verification/decide:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to record review decision' },
      { status: 500 },
    );
  }
}, { permission: 'packing.review' });
