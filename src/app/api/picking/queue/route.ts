import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';
import type { PickQueueRow } from '@/lib/picking/queue';
import { resolvePickQueueStaffId } from '@/lib/picking/pick-queue-scope';

/** GET /api/picking/queue */

const QUEUE_SQL = `
  SELECT
    o.id                                          AS order_id,
    o.order_id                                    AS order_label,
    c.first_name                                  AS first_name,
    c.last_name                                   AS last_name,
    o.account_source                              AS account_source,
    (SELECT MIN(wa.deadline_at)
       FROM work_assignments wa
      WHERE wa.entity_type = 'ORDER'
        AND wa.entity_id   = o.id
        AND wa.organization_id = o.organization_id)::text  AS deadline_at,
    COUNT(*) FILTER (WHERE oua.state = 'ALLOCATED')::int  AS pending_count,
    COUNT(*) FILTER (WHERE oua.state = 'PICKING')::int    AS in_progress_count,
    COUNT(*)::int                                          AS total_count,
    (SELECT ps.picker_staff_id
       FROM picking_sessions ps
      WHERE ps.order_id = o.id
        AND ps.ended_at IS NULL
      ORDER BY ps.started_at DESC
      LIMIT 1)                                    AS active_picker_id
  FROM order_unit_allocations oua
  JOIN orders    o ON o.id = oua.order_id AND o.organization_id = oua.organization_id
  LEFT JOIN customers c ON c.id = o.customer_id AND c.organization_id = o.organization_id
  WHERE oua.organization_id = $1
    AND oua.state IN ('ALLOCATED', 'PICKING')
    -- Mine (the ORDER/PICK assignee) or nobody's yet.
    AND (
      EXISTS (
        SELECT 1 FROM work_assignments wa_pick
         WHERE wa_pick.entity_type = 'ORDER'
           AND wa_pick.entity_id = o.id
           AND wa_pick.work_type = 'PICK'
           AND wa_pick.organization_id = o.organization_id
           AND wa_pick.status IN ('ASSIGNED', 'IN_PROGRESS')
           AND wa_pick.assigned_tech_id = $2
      )
      OR NOT EXISTS (
        SELECT 1 FROM work_assignments wa_pick
         WHERE wa_pick.entity_type = 'ORDER'
           AND wa_pick.entity_id = o.id
           AND wa_pick.work_type = 'PICK'
           AND wa_pick.organization_id = o.organization_id
           AND wa_pick.status IN ('ASSIGNED', 'IN_PROGRESS')
           AND wa_pick.assigned_tech_id IS NOT NULL
      )
    )
  GROUP BY o.id, o.order_id, c.first_name, c.last_name, o.account_source
  ORDER BY deadline_at ASC NULLS LAST, o.id ASC
  LIMIT 200
`;

export const GET = withAuth(async (request, ctx) => {
  const { searchParams } = new URL(request.url);
  const scoped = resolvePickQueueStaffId({
    sessionStaffId: ctx.staffId,
    staffIdParam: searchParams.get('staffId'),
    canInspectOther: ctx.permissions.has('admin.view_logs'),
  });
  if (!scoped.ok) {
    return NextResponse.json({ ok: false, error: scoped.error }, { status: 400 });
  }
  const staffId = scoped.staffId;

  const q = await tenantQuery<{
    order_id: number;
    order_label: string | null;
    first_name: string | null;
    last_name: string | null;
    account_source: string | null;
    deadline_at: string | null;
    pending_count: number;
    in_progress_count: number;
    total_count: number;
    active_picker_id: number | null;
  }>(ctx.organizationId, QUEUE_SQL, [ctx.organizationId, staffId]);

  const rows: PickQueueRow[] = q.rows.map((r) => {
    const first = (r.first_name || '').trim();
    const last = (r.last_name || '').trim();
    const initials = `${first[0] || '?'}${last[0] || ''}`.toUpperCase();
    const fullName = [first, last].filter(Boolean).join(' ') || null;
    return {
      orderId: r.order_id,
      orderLabel: r.order_label ? `#${r.order_label}` : `#${r.order_id}`,
      customerInitials: initials,
      customerName: fullName,
      accountSource: r.account_source,
      shipByDate: r.deadline_at,
      pendingCount: r.pending_count,
      inProgressCount: r.in_progress_count,
      totalCount: r.total_count,
      activePickerId: r.active_picker_id,
    };
  });

  return NextResponse.json({ ok: true, count: rows.length, queue: rows, staffId });
}, { permission: 'picking.view' });
