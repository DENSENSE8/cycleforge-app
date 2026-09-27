/** PATCH /api/staff/[id]/color — set a staffer's identity colour (`color_hex`). */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';
import { ApiError, errorResponse } from '@/lib/api';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { parseBody } from '@/lib/schemas/parse';
import { StaffColorBody } from '@/lib/schemas/staff-color';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';

export const dynamic = 'force-dynamic';

const MANAGE_STAFF_PERM = 'admin.manage_staff';

/** withAuth doesn't forward Next's params — `.../api/staff/[id]/color`. */
function staffIdFromPath(pathname: string): number {
  const segments = pathname.split('/').filter(Boolean);
  return Number(segments[segments.length - 2]);
}

async function resolveSubject(
  req: NextRequest,
  ctx: AuthContext,
): Promise<{ staffId: number; currentColor: string }> {
  const staffId = staffIdFromPath(req.nextUrl.pathname);
  if (!Number.isFinite(staffId) || staffId <= 0) {
    throw ApiError.badRequest('Valid staff id is required');
  }

  const r = await tenantQuery<{ id: number; color_hex: string }>(
    ctx.organizationId,
    `SELECT id, color_hex
       FROM staff
      WHERE id = $1 AND organization_id = $2
      LIMIT 1`,
    [staffId, ctx.organizationId],
  );
  const row = r.rows[0];
  if (!row) throw ApiError.notFound('Staff not found');

  const isSelf = staffId === ctx.staffId;
  if (!isSelf && !ctx.permissions.has(MANAGE_STAFF_PERM)) {
    throw new ApiError(
      403,
      `Requires ${MANAGE_STAFF_PERM} to change another staffer's colour`,
    );
  }

  return { staffId, currentColor: row.color_hex };
}

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  try {
    const subject = await resolveSubject(req, ctx);
    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(StaffColorBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const nextHex = parsed.color_hex.toLowerCase();
    if (nextHex === subject.currentColor.toLowerCase()) {
      return NextResponse.json({
        ok: true,
        staffId: subject.staffId,
        colorHex: nextHex,
        unchanged: true,
      });
    }

    await withTenantTransaction(ctx.organizationId, async (client) => {
      await client.query(
        `UPDATE staff
            SET color_hex = $1
          WHERE id = $2 AND organization_id = $3`,
        [nextHex, subject.staffId, ctx.organizationId],
      );
    });

    await invalidateCacheTags([CACHE_TAGS.staff]);

    await recordAudit(pool, ctx, req, {
      source: 'staff-color',
      action: AUDIT_ACTION.STAFF_COLOR_SET,
      entityType: AUDIT_ENTITY.STAFF,
      entityId: subject.staffId,
      before: { color_hex: subject.currentColor },
      after: { color_hex: nextHex },
      method: 'manual',
      extra: { self: subject.staffId === ctx.staffId },
    });

    return NextResponse.json({
      ok: true,
      staffId: subject.staffId,
      colorHex: nextHex,
    });
  } catch (error) {
    return errorResponse(error, 'PATCH /api/staff/[id]/color');
  }
}, {});
