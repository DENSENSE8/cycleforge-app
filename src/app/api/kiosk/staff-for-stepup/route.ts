/**
 * GET /api/kiosk/staff-for-stepup
 *
 * Device-authed roster for PIN step-up on the tablet (Pay at register).
 * Returns only staff who hold `walk_in.take_payment` (admins included via
 * effective-permissions short-circuit). No secrets — id/name/role/color/avatar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { effectivePermissionsForStaff } from '@/lib/auth/role-store';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

interface StaffRow {
  id: number;
  name: string;
  role: string;
  color_hex: string | null;
  avatar_photo_id: number | null;
}

export const GET = withKioskAuth(async (_req: NextRequest, ctx) => {
  const orgId = ctx.organizationId as OrgId;
  const rows = await withTenantTransaction(orgId, async (client) => {
    const r = await client.query<StaffRow>(
      `SELECT id, name, role, color_hex, avatar_photo_id
         FROM staff
        WHERE organization_id = $1
          AND COALESCE(status, 'active') IN ('active', 'invited')
          AND COALESCE(active, true) = true
          AND pin_hash IS NOT NULL
        ORDER BY name ASC`,
      [orgId],
    );
    return r.rows;
  });

  const eligible = [];
  for (const row of rows) {
    const perms = await effectivePermissionsForStaff(Number(row.id), orgId);
    if (!perms.has('walk_in.take_payment')) continue;
    eligible.push({
      id: Number(row.id),
      name: row.name,
      role: row.role,
      color_hex: row.color_hex ?? undefined,
      avatar_photo_id: row.avatar_photo_id,
    });
  }

  return NextResponse.json(
    { staff: eligible },
    { headers: { 'cache-control': 'no-store' } },
  );
});
