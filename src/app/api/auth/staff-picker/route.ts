/**
 * GET /api/auth/staff-picker
 *
 * Slim list for the sign-in screen — only staff with status='active', sorted
 * by name, with just enough fields to render the grid. Returns `hasPin` so
 * the UI can disable the PIN button for staff that haven't enrolled yet, and
 * `pinless` so the UI knows whether to skip the PIN pad entirely (controlled
 * by the AUTH_PINLESS_SIGNIN env var for rollouts where staff haven't been
 * issued PINs yet).
 *
 * Multi-tenant: the picker is scoped by the tenant resolved from the
 * `x-tenant-slug` header set by proxy.ts (`resolveOrgIdFromRequest`). On the
 * apex / no-subdomain host there is NO tenant, so the picker returns an EMPTY
 * list — it no longer leaks the USAV dogfood tenant's staff. An operator can
 * opt one dogfood tenant onto the apex host via `DEFAULT_TENANT_SLUG` during
 * the DNS cutover; that is explicit, not a silent USAV fallback.
 *
 * Public: the picker has to render before sign-in. We expose only id/name/
 * role/colour/avatar/hasPin — no email, employee_code, or sensitive columns.
 */

import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { resolveOrgIdFromRequest, NIL_ORG_ID } from '@/lib/tenancy/resolve-org-from-request';

export const runtime = 'nodejs';

interface Row {
  id: number;
  name: string;
  role: string;
  has_pin: boolean;
  color_hex: string;
  /** Profile photo id. Served anonymously by /api/photos/[id]/content's
   *  current-staff-avatar branch — the same disclosure class as name + role,
   *  which this route already returns publicly. */
  avatar_photo_id: number | null;
}

function isPinlessEnabled(): boolean {
  const v = (process.env.AUTH_PINLESS_SIGNIN ?? '').toLowerCase().trim();
  return v === 'true' || v === '1' || v === 'on' || v === 'yes';
}

export async function GET(req: NextRequest) {
  try {
    const orgId = await resolveOrgIdFromRequest(req);
    // Apex / unknown slug → nil org → return an empty picker rather than
    // running the query (which would also be empty, but skip the round-trip).
    if (orgId === NIL_ORG_ID) {
      return NextResponse.json(
        { staff: [], pinless: isPinlessEnabled() },
        { headers: { 'cache-control': 'no-store' } },
      );
    }
    const r = await pool.query(
      `SELECT id, name, role, color_hex, avatar_photo_id, (pin_hash IS NOT NULL) AS has_pin
         FROM staff
        WHERE organization_id = $1
          AND COALESCE(status, 'active') IN ('active', 'invited')
          AND COALESCE(active, true) = true
        ORDER BY name ASC`,
      [orgId],
    );
    return NextResponse.json(
      { staff: r.rows as Row[], pinless: isPinlessEnabled() },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (err) {
    console.error('[/api/auth/staff-picker] error:', err);
    return NextResponse.json({ staff: [], pinless: isPinlessEnabled() }, { status: 200 });
  }
}
