import { NextRequest, NextResponse, after } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import type { OrgId } from '@/lib/tenancy/constants';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { parseBody } from '@/lib/schemas/parse';
import { LabelIntakePairBody } from '@/lib/schemas/label-intake';
import { pairReferenceLabels } from '@/lib/shipping/label-intake';
import { labelIntakeErrorResponse } from '@/lib/shipping/label-intake-errors';
import { publishOrderChanged } from '@/lib/realtime/publish';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';

export const dynamic = 'force-dynamic';

/**
 * POST /api/shipping/label-intake/pair
 *
 * Attach every reference-only label recorded under `ref` to the order that now
 * carries that number: `order_id` is set, a replacement joins the order's
 * tracking, each label writes the order's notes trail. Idempotent — a second
 * call finds nothing unpaired and returns `paired: 0`.
 *
 * Body: { ref, orderId }
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const orgId = ctx.organizationId as OrgId;
  try {
    const raw = await req.json().catch(() => ({}));
    const body = parseBody(LabelIntakePairBody, raw);
    if (body instanceof NextResponse) return body;

    const paired = await pairReferenceLabels(orgId, { ref: body.ref, orderId: body.orderId, staffId: ctx.staffId ?? null });
    if (paired > 0) {
      await recordAudit(pool, ctx, req, {
        source: 'api.shipping.label-intake.pair',
        action: AUDIT_ACTION.LABEL_LINKED,
        entityType: AUDIT_ENTITY.ORDER,
        entityId: body.orderId,
        after: { orderRef: body.ref, paired },
      });
      after(async () => {
        try {
          await invalidateCacheTags(['orders', 'shipped', 'orders-next']);
          await publishOrderChanged({ organizationId: orgId, orderIds: [body.orderId], source: 'label-intake.pair' });
        } catch (e) {
          console.warn('[label-intake] pair realtime failed', e);
        }
      });
    }
    return NextResponse.json({ ok: true, paired });
  } catch (error) {
    return labelIntakeErrorResponse(error, 'POST /api/shipping/label-intake/pair');
  }
}, { permission: 'shipping.buy_label' });
