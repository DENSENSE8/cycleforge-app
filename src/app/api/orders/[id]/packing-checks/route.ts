import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import pool from '@/lib/db';
import { parseBody } from '@/lib/schemas/parse';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { recordPackingTick } from '@/lib/packing/packing-checks';

/** POST /api/orders/[id]/packing-checks — persist one packing-checklist tick (packing-checklist-plan Phase 2). */

const PackingCheckBody = z.object({
  kind: z.enum(['KIT_PART', 'PACKING_CHECK']),
  stepId: z.number().int().positive(),
  checked: z.boolean(),
  /**
   * How the tick was earned (step-document-reveal-RULING §3). `print` is the
   * durable path for an insert; `acknowledgement` is the advisory tap. Defaults
   * server-side to acknowledgement when omitted so older clients stay valid.
   */
  origin: z.enum(['print', 'acknowledgement']).optional(),
  /** Client-minted idempotency/trace id — recorded in the audit trail. */
  clientEventId: z.string().trim().min(8).max(64).optional(),
});

export const POST = withAuth(async (request, ctx) => {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  // .../api/orders/[id]/packing-checks → id is segments[-2]
  const orderRowId = Number(segments[segments.length - 2]);
  if (!Number.isFinite(orderRowId) || orderRowId <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid order id' }, { status: 400 });
  }

  const raw = await request.json().catch(() => ({}));
  const parsed = parseBody(PackingCheckBody, raw);
  if (parsed instanceof NextResponse) return parsed;

  const verifiedBy = Number(ctx.staffId);
  if (!Number.isFinite(verifiedBy) || verifiedBy <= 0) {
    return NextResponse.json({ ok: false, error: 'no staff identity on request' }, { status: 401 });
  }

  const result = await recordPackingTick(ctx.organizationId, {
    orderRowId,
    kind: parsed.kind,
    stepId: parsed.stepId,
    checked: parsed.checked,
    verifiedBy,
    origin: parsed.origin,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  await recordAudit(pool, ctx, request, {
    source: 'order-packing-checks',
    action: AUDIT_ACTION.QC_RESULT_RECORD,
    entityType: AUDIT_ENTITY.ORDER,
    entityId: orderRowId,
    // Print is a system-adjacent confirmation; the tap is the human override.
    method: parsed.origin === 'print' ? 'system' : 'manual',
    extra: {
      kind: parsed.kind,
      step_type: result.stepType,
      step_id: parsed.stepId,
      checked: parsed.checked,
      origin: parsed.origin ?? 'acknowledgement',
      client_event_id: parsed.clientEventId ?? null,
    },
  });

  return NextResponse.json({ ok: true, verification: result.verification });
}, { permission: 'packing.complete_order' });
