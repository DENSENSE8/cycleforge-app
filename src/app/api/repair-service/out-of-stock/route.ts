import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';
import { WORK_ASSIGNMENTS_ACTIVE_ON_CONFLICT } from '@/lib/neon/work-assignments-conflict';

/** POST /api/repair-service/out-of-stock */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const orgId = ctx.organizationId;
    const { repairId, assignmentId, part } = await req.json();

    if (!repairId) {
      return NextResponse.json({ error: 'repairId is required' }, { status: 400 });
    }
    if (!part || !String(part).trim()) {
      return NextResponse.json({ error: 'part description is required' }, { status: 400 });
    }

    const partText = String(part).trim();

    if (assignmentId) {
      await tenantQuery(
        orgId,
        `UPDATE work_assignments
            SET out_of_stock = $1,
                updated_at   = NOW()
          WHERE id          = $2
            AND entity_type = 'REPAIR'
            AND organization_id = $3`,
        [partText, assignmentId, orgId],
      );
    } else {
      // Active uniqueness is org-led (`ux_work_assignments_active_entity`). Still
      // pre-validate repair ownership so a guessed repairId 404s instead of
      // creating a dangling REPAIR assignment.
      const owner = await tenantQuery(
        orgId,
        `SELECT 1
           FROM repair_service
          WHERE id = $1
            AND organization_id = $2
          LIMIT 1`,
        [repairId, orgId],
      );
      if (owner.rowCount === 0) {
        return NextResponse.json({ error: 'Repair not found' }, { status: 404 });
      }

      await tenantQuery(
        orgId,
        `INSERT INTO work_assignments
              (entity_type, entity_id, work_type, status, out_of_stock, priority, assigned_at, organization_id)
         VALUES ('REPAIR', $1, 'REPAIR', 'ASSIGNED', $2, 100, NOW(), $3)
         ON CONFLICT ${WORK_ASSIGNMENTS_ACTIVE_ON_CONFLICT}
         DO UPDATE SET
           out_of_stock = EXCLUDED.out_of_stock,
           updated_at   = NOW()
         WHERE work_assignments.organization_id = $3`,
        [repairId, partText, orgId],
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('POST /api/repair-service/out-of-stock error:', error);
    return NextResponse.json(
      { error: 'Failed to record out of stock', details: error.message },
      { status: 500 },
    );
  }
}, { permission: 'repair.mark_repaired', feature: 'repair' });
