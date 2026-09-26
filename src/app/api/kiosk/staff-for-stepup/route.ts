/**
 * GET /api/kiosk/staff-for-stepup?scope=payment|adjust_price|signin
 * because the History face signs in pinlessly (operator 2026-09-22:
 */

import { NextRequest, NextResponse } from 'next/server';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { effectivePermissionsForStaff } from '@/lib/auth/role-store';
import type { PermissionString } from '@/lib/auth/permissions-shared';
import type { OrgId } from '@/lib/tenancy/constants';

/** The permission each PIN-pad scope's roster must hold. `signin` has none. */
const SCOPE_PERMISSION: Record<string, PermissionString> = {
  payment: 'walk_in.take_payment',
  adjust_price: 'walk_in.adjust_price',
};

export const runtime = 'nodejs';

interface StaffRow {
  id: number;
  name: string;
  role: string;
  color_hex: string | null;
  avatar_photo_id: number | null;
  has_pin: boolean;
}

export const GET = withKioskAuth(async (req: NextRequest, ctx) => {
  const orgId = ctx.organizationId as OrgId;
  const scope = req.nextUrl.searchParams.get('scope') ?? 'payment';
  const signin = scope === 'signin';
  const required = SCOPE_PERMISSION[scope] ?? SCOPE_PERMISSION.payment;

  const rows = await withTenantTransaction(orgId, async (client) => {
    const r = await client.query<StaffRow>(
      `SELECT id, name, role, color_hex, avatar_photo_id,
              (pin_hash IS NOT NULL) AS has_pin
         FROM staff
        WHERE organization_id = $1
          AND COALESCE(status, 'active') IN ('active', 'invited')
          AND COALESCE(active, true) = true
          AND ($2::boolean OR pin_hash IS NOT NULL)
        ORDER BY name ASC`,
      [orgId, signin],
    );
    return r.rows;
  });

  const eligible = [];
  for (const row of rows) {
    // The permission walk is the PIN scopes' question only. A sign-in roster
    // that hid staff without a money permission would refuse to name the
    // technician who is actually holding the tablet.
    if (!signin) {
      const perms = await effectivePermissionsForStaff(Number(row.id), {}, orgId);
      if (!perms.has(required)) continue;
    }
    eligible.push({
      id: Number(row.id),
      name: row.name,
      role: row.role,
      has_pin: Boolean(row.has_pin),
      color_hex: row.color_hex ?? '#10b981',
      avatar_photo_id: row.avatar_photo_id,
    });
  }

  return NextResponse.json(
    { staff: eligible },
    { headers: { 'cache-control': 'no-store' } },
  );
});
