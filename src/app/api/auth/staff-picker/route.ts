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
 * apex / no-subdomain host there is NO public tenant, so an anonymous picker
 * returns an EMPTY list — it no longer leaks the USAV dogfood tenant's staff.
 * When a valid session cookie is present on that apex host, the picker uses
 * the session's organization (in-app switch-staff / throw / clipboard). That
 * is the caller's own workspace, not a silent USAV fallback. An operator can
 * still opt one dogfood tenant onto the apex host via `DEFAULT_TENANT_SLUG`
 * during the DNS cutover.
 *
 * Public: the picker has to render before sign-in. We expose only id/name/
 * role/colour/avatar/hasPin — no email, employee_code, or sensitive columns.
 *
 * Failure class: **PRIMARY resource.** An empty `staff` array is a legitimate
 * state (apex host / a tenant with no active staff), so an unexpected throw
 * MUST NOT be answered with one — it renders as "No active staff. Ask an admin
 * to add you." and nobody files a bug. On 2026-08-01 this route selected a
 * column that did not exist, caught the throw, and returned `{ staff: [] }`
 * with HTTP 200: sign-in was down on every tenant with nothing anywhere to
 * explain it, while the staff rows were all present and healthy.
 *
 * There is no useful half of this payload to salvage — PIN sign-in is
 * impossible without the roster — so an unexpected throw answers **503** with
 * `degraded: true` + `error`. Callers must branch on it (`StaffPickerList`
 * renders a distinct "couldn't load" state; `tests/e2e/global-setup.ts` and
 * `tests/shot.mjs` already throw on a non-OK status).
 */

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
    // Signed-in callers (Change staff on localhost / apex) use their session org.
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
    // Role on this payload is the same primary as getCurrentUser: lowest
    // `roles.position` on `staff_roles`, then the legacy `staff.role` mirror.
    // Do not SELECT `staff.role` alone — that column can lag the assignment
    // table and paint PACKER/TECHNICIAN on the sign-in roster.
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
