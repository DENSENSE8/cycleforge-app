/** GET /api/auth/staff-picker */

import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { loadSession, readSessionSid } from '@/lib/auth/session';
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
    let orgId = await resolveOrgIdFromRequest(req);
    // Apex / unknown slug: anonymous callers stay empty (no tenant leak).
    // Signed-in callers (Switch staff on localhost / apex) use their session org.
    if (orgId === NIL_ORG_ID) {
      const cookieStore = req.cookies;
      const sid = cookieStore ? readSessionSid(cookieStore) : null;
      const session = sid ? await loadSession(sid) : null;
      if (session?.organizationId) orgId = session.organizationId;
    }
    if (orgId === NIL_ORG_ID) {
      return NextResponse.json(
        { staff: [], pinless: isPinlessEnabled() },
        { headers: { 'cache-control': 'no-store' } },
      );
    }
    // Role on this payload is the same primary as getCurrentUser:
    const r = await pool.query(
      `SELECT s.id, s.name,
              COALESCE(pr.key, s.role) AS role,
              s.color_hex, s.avatar_photo_id,
              (s.pin_hash IS NOT NULL) AS has_pin
         FROM staff s
         LEFT JOIN LATERAL (
           SELECT r.key
             FROM staff_roles sr
             JOIN roles r ON r.id = sr.role_id AND r.organization_id = s.organization_id
            WHERE sr.staff_id = s.id
            ORDER BY r.position ASC, r.id ASC
            LIMIT 1
         ) pr ON true
        WHERE s.organization_id = $1
          AND COALESCE(s.status, 'active') IN ('active', 'invited')
          AND COALESCE(s.active, true) = true
        ORDER BY s.name ASC`,
      [orgId],
    );
    return NextResponse.json(
      { staff: r.rows as Row[], pinless: isPinlessEnabled() },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (err) {
    console.error('[/api/auth/staff-picker] error:', err);
    // NOT an empty 200 — see the failure-class note in the header docblock.
    return NextResponse.json(
      {
        staff: [],
        pinless: isPinlessEnabled(),
        degraded: true,
        error: 'staff_picker_unavailable',
      },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
