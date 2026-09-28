import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { OrderQcAssigneeBody } from '@/lib/schemas/qc-assignee';
import { assignOrderQcTech } from '@/lib/qc/qc-assignee';
import { AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { invalidateOrderViews } from '@/lib/orders/invalidation';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { publishReceivingLogChanged } from '@/lib/realtime/publish';

/**
 * PATCH — assign (or clear) an order's QC tech: writes
 * `receiving_line_testing.assigned_tech_id` on the origin receiving line of
 * every unit live-allocated to the order. The order record's QC step.
 */
export const PATCH = withAuth(async (request, ctx) => {
  const raw = await request.json().catch(() => ({}));
  const parsed = parseBody(OrderQcAssigneeBody, raw);
  if (parsed instanceof NextResponse) return parsed;

  const result = await assignOrderQcTech(ctx.organizationId, parsed.order_id, parsed.assigned_tech_id);
  switch (result.kind) {
    case 'order_not_found':
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    case 'staff_not_found':
      return NextResponse.json({ success: false, error: 'Staff member not found' }, { status: 404 });
    case 'no_lines':
      return NextResponse.json(
        { success: false, error: 'No allocated unit on this order came from a receiving line' },
        { status: 409 },
      );
    case 'ok':
      await invalidateOrderViews({ organizationId: ctx.organizationId, orderIds: [parsed.order_id], source: 'qc.assign' });
      await invalidateReceivingViews(ctx.organizationId);
      await publishReceivingLogChanged({
        organizationId: ctx.organizationId,
        action: 'update',
        rowId: String(result.lineIds[0]),
        source: 'receiving-lines.qc-assign',
      });
      return NextResponse.json({
        success: true,
        order_id: parsed.order_id,
        assigned_tech_id: parsed.assigned_tech_id,
        receiving_line_ids: result.lineIds,
      });
  }
}, {
  permission: 'tech.qc_pass',
  audit: {
    source: 'qc',
    action: AUDIT_ACTION.RECEIVING_LINE_QC_ASSIGN,
    entityType: AUDIT_ENTITY.ORDER,
    entityId: ({ response }) => (response as { order_id?: number } | null)?.order_id ?? null,
    extra: ({ response }) => {
      const r = response as { assigned_tech_id?: number | null; receiving_line_ids?: number[] } | null;
      return { assigned_tech_id: r?.assigned_tech_id ?? null, receiving_line_ids: r?.receiving_line_ids ?? [] };
    },
  },
});
