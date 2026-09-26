import { NextRequest, NextResponse, after } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { createOrderNote } from '@/lib/orders/order-notes';
import { labelTrailNote, unlinkOrderLabel } from '@/lib/shipping/order-label-links';
import { publishOrderChanged } from '@/lib/realtime/publish';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import type { OrgId } from '@/lib/tenancy/constants';
import pool from '@/lib/db';

/** DELETE /api/orders/[id]/labels/[labelId] — take a paired label off the order (`labelId` = the order-label row id). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; labelId: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'shipping.buy_label');
    if (gate.denied) return gate.denied;

    const { id: rawId, labelId: rawLabel } = await params;
    const orderId = Number(rawId);
    const rowId = Number(rawLabel);
    if (!Number.isInteger(orderId) || orderId <= 0 || !Number.isInteger(rowId) || rowId <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });
    }

    const orgId = gate.ctx.organizationId as OrgId;
    const staffId = gate.ctx.staffId ?? null;
    const result = await unlinkOrderLabel({ orgId, orderId, rowId, staffId });
    if (!result.ok) {
      return NextResponse.json({ success: false, code: result.code, error: result.error }, { status: result.status });
    }

    if (!result.idempotent) {
      const row = result.row;
      await recordAudit(pool, gate.ctx, req, {
        source: 'orders-labels-api',
        action: AUDIT_ACTION.LABEL_UNLINKED,
        entityType: AUDIT_ENTITY.ORDER,
        entityId: orderId,
        before: {
          labelRowId: row.id,
          labelId: row.labelId,
          purpose: row.purpose,
          creationType: row.creationType,
          tracking: row.trackingNumber,
        },
        after: { status: 'unlinked' },
        extra: { reopenedIngestionId: result.reopenedIngestionId },
      });
      await createOrderNote({
        orderId,
        organizationId: orgId,
        noteText: labelTrailNote('Unlinked', row.purpose, { carrierCode: null, trackingNumber: row.trackingNumber, labelId: row.labelId }),
        staffId,
      }).catch((e) => console.warn('[label-unlink] order note failed', e));
      after(async () => {
        try {
          await invalidateCacheTags(['orders', 'shipped', 'orders-next']);
          await publishOrderChanged({ organizationId: orgId, orderIds: [orderId], source: 'outbound.label-unlink' });
        } catch (e) {
          console.warn('[label-unlink] realtime/cache failed', e);
        }
      });
    }

    return NextResponse.json({ success: true, idempotent: result.idempotent });
  } catch (error) {
    console.error('Error in DELETE /api/orders/[id]/labels/[labelId]:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Could not unlink the label.' },
      { status: 500 },
    );
  }
}
