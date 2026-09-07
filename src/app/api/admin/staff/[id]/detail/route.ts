/**
 * GET /api/admin/staff/[id]/detail
 *
 * Full envelope for the admin StaffAccessDetail view: staff row including
 * override columns, current passkey list, active sessions, last 20 audit
 * entries. One round-trip per detail open.
 *
 * Lives at `/detail` rather than overloading GET on the existing
 * `/api/admin/staff/[id]` (which only has PATCH/DELETE today) so the
 * existing route's contract isn't affected.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';
import { sessionHandle } from '@/lib/auth/session';

export const runtime = 'nodejs';

/**
 * Rows whose `sid` column must be masked before the envelope leaves the
 * server: the key name stays `sid` (the admin UI reads `s.sid` as its list key
 * and as the argument to DELETE /api/admin/sessions/[handle]) but the value is
 * the opaque handle, so a listed session can never be replayed as a cookie.
 */
interface AuditSidRow {
  sid: string | null;
  [column: string]: unknown;
}
interface SessionSidRow {
  sid: string;
  [column: string]: unknown;
}

function idFromUrl(req: NextRequest): number | null {
  const parts = req.nextUrl.pathname.split('/').filter(Boolean);
  const idx = parts.findIndex((p) => p === 'detail') - 1;
  if (idx < 0) return null;
  const n = Number(parts[idx]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const orgId = ctx.organizationId;
  const id = idFromUrl(req);
  if (!id) return NextResponse.json({ error: 'INVALID_ID' }, { status: 400 });

  // staff is tenant-owned: gate the [id] lookup on the caller's org so a
  // cross-tenant staff id yields no row and 404s below (never 403).
  const staffQ = tenantQuery(
    orgId,
    `SELECT id, name, role, status, active, employee_id, employee_code,
            permissions_added, permissions_removed,
            mobile_display_config,
            default_home_path, default_home_path_mobile,
            COALESCE(session_policy, 'default') AS session_policy,
            (pin_hash IS NOT NULL) AS has_pin,
            pin_set_at, pin_locked_until,
            last_login_at, created_at
       FROM staff WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [id, orgId],
  );
  // staff_passkeys has no organization_id; scope it via its parent staff row
  // in this org so another tenant's passkeys can never surface for a colliding
  // id (staff.id is globally unique so this is belt-and-suspenders with the
  // staff precheck).
  const passkeysQ = tenantQuery(
    orgId,
    `SELECT id,
            encode(credential_id, 'base64') AS credential_id,
            transports, aaguid::text, device_label, last_used_at, created_at
       FROM staff_passkeys
      WHERE staff_id = $1
        AND staff_id IN (SELECT id FROM staff WHERE id = $1 AND organization_id = $2)
      ORDER BY created_at DESC`,
    [id, orgId],
  );
  // staff_sessions is tenant-owned: filter on its own organization_id.
  const sessionsQ = tenantQuery<SessionSidRow>(
    orgId,
    `SELECT sid, device_kind, device_label, ip::text AS ip,
            created_at, last_seen_at, expires_at
       FROM staff_sessions
      WHERE staff_id = $1 AND organization_id = $2
        AND revoked_at IS NULL AND expires_at > NOW()
      ORDER BY last_seen_at DESC`,
    [id, orgId],
  );
  // auth_audit has no organization_id; scope it via its parent staff row.
  const auditQ = tenantQuery<AuditSidRow>(
    orgId,
    `SELECT id, event, result, ip::text AS ip, sid, user_agent, detail, created_at
       FROM auth_audit
      WHERE staff_id = $1
        AND staff_id IN (SELECT id FROM staff WHERE id = $1 AND organization_id = $2)
      ORDER BY created_at DESC
      LIMIT 20`,
    [id, orgId],
  );
  // staff_roles is a global junction (no organization_id), but grants are
  // intra-org by construction since roles became org-scoped (2026-09-06);
  // the roles join carries the org conjunct for defense. The all-roles
  // picker MUST be org-scoped — it feeds the assignment UI.
  const rolesQ = tenantQuery(
    orgId,
    `SELECT r.id, r.key, r.label, r.color, r.position, r.permissions, r.is_system,
            r.mobile_defaults,
            sr.granted_at, sr.granted_by
       FROM staff_roles sr
       JOIN roles r ON r.id = sr.role_id AND r.organization_id = $2::uuid
      WHERE sr.staff_id = $1
      ORDER BY r.position ASC, r.id ASC`,
    [id, orgId],
  );
  const allRolesQ = tenantQuery(
    orgId,
    `SELECT id, key, label, color, position, permissions, is_system, mobile_defaults
       FROM roles
      WHERE organization_id = $1::uuid
      ORDER BY position ASC, id ASC`,
    [orgId],
  );
  const [staffR, passkeysR, sessionsR, auditR, rolesR, allRolesR] = await Promise.all([
    staffQ, passkeysQ, sessionsQ, auditQ, rolesQ, allRolesQ,
  ]);
  const staff = staffR.rows[0];
  if (!staff) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // Both `sessions` and `audit` carry a raw `sid` column in the DB. Mask each
  // to its handle on the way out — same key, non-replayable value.
  return NextResponse.json({
    staff,
    passkeys: passkeysR.rows,
    sessions: sessionsR.rows.map((row) => ({ ...row, sid: sessionHandle(row.sid) })),
    audit: auditR.rows.map((row) => ({ ...row, sid: row.sid ? sessionHandle(row.sid) : null })),
    roles: rolesR.rows,
    availableRoles: allRolesR.rows,
  });
}, { permission: 'admin.manage_staff' });
