/**
 * PUT /api/staff/[id]/functional-roles — grant / revoke a floor functional
 * role (picker, packer) for one staffer.
 *
 * Gate — `work_orders.claim`, the same operator-level permission as the
 * listing→staff assign route: whoever routes Pick / Pack work on To Ship may
 * say who picks and packs. This never touches RBAC access roles
 * (`staff_roles`), so it cannot widen what anyone may access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { parseBody } from '@/lib/schemas/parse';
import { StaffFunctionalRoleBody } from '@/lib/schemas/staff-functional-roles';
import { setStaffFunctionalRole } from '@/lib/staff/functional-roles';

export const dynamic = 'force-dynamic';

/** `.../api/staff/[id]/functional-roles` */
function staffIdFromPath(pathname: string): number {
  const segments = pathname.split('/').filter(Boolean);
  return Number(segments[segments.length - 2]);
}

export async function PUT(req: NextRequest) {
  const gate = await requireRoutePerm(req, 'work_orders.claim');
  if (gate.denied) return gate.denied;
  const { ctx } = gate;

  const staffId = staffIdFromPath(req.nextUrl.pathname);
  if (!Number.isFinite(staffId) || staffId <= 0) {
    return NextResponse.json({ success: false, error: 'Valid staff id is required' }, { status: 400 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = parseBody(StaffFunctionalRoleBody, raw);
  if (parsed instanceof NextResponse) return parsed;

  try {
    const result = await setStaffFunctionalRole(
      ctx.organizationId,
      staffId,
      parsed.role,
      parsed.enabled,
      ctx.staffId ?? null,
    );
    if (result.status === 'not_found') {
      return NextResponse.json({ success: false, error: 'Staff not found' }, { status: 404 });
    }

    if (result.changed) {
      await invalidateCacheTags([CACHE_TAGS.staff]);
      await recordAudit(pool, ctx, req, {
        source: 'staff-functional-roles',
        action: AUDIT_ACTION.STAFF_FUNCTIONAL_ROLE_SET,
        entityType: AUDIT_ENTITY.STAFF,
        entityId: staffId,
        after: { role: parsed.role, enabled: parsed.enabled, roles: result.roles },
        method: 'manual',
      });
    }

    return NextResponse.json({ success: true, staffId, functionalRoles: result.roles });
  } catch (error) {
    console.error('PUT /api/staff/[id]/functional-roles failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to update functional role' }, { status: 500 });
  }
}
