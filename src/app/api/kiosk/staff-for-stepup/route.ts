/**
 * GET /api/kiosk/staff-for-stepup?scope=payment|signin
 *
 * The counter tablet's staff roster, resolved from the DEVICE's org. Two
 * scopes, because the tablet asks two different questions:
 *
 *   • `payment` (default) — who can AUTHORIZE money. PIN-holders who hold
 *     `walk_in.take_payment`; the pad behind this pick verifies the PIN.
 *   • `signin` — who is STANDING HERE. Every active staffer, PIN or not,
 *     because the History face signs in pinlessly (operator 2026-09-22:
 *     *"remove the pin, use the same pinless sign in for the switching
 *     staff — this is dogfood"*), exactly as the desk's `SwitchStaffSheet`
 *     has since 2026-09-15.
 *
 * One route, because it is one roster with one tenancy rule; a second endpoint
 * would be a second place for the org scoping to drift.
 *
 * The response shape is `StaffPickerList`'s `StaffRow` — the tablet mounts the
 * SAME picker component as `/signin` and the desktop switcher, so this route
 * answers in that component's vocabulary. No secrets: id / name / role /
 * colour / avatar / has_pin.
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
  has_pin: boolean;
}

export const GET = withKioskAuth(async (req: NextRequest, ctx) => {
  const orgId = ctx.organizationId as OrgId;
  const signin = req.nextUrl.searchParams.get('scope') === 'signin';

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
    // The permission walk is the PAYMENT scope's question only. A sign-in
    // roster that hid staff without `walk_in.take_payment` would refuse to name
    // the technician who is actually holding the tablet.
    if (!signin) {
      const perms = await effectivePermissionsForStaff(Number(row.id), {}, orgId);
      if (!perms.has('walk_in.take_payment')) continue;
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
