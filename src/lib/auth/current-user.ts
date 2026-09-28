/** Server-side helpers to resolve the current authenticated staff from the `cf_sid` session cookie. */

import { cookies } from 'next/headers';
import pool from '@/lib/db';
import {
  isPlausibleSid,
  readSessionSid,
  SESSION_ROW_COLUMNS,
  validateSessionRow,
  type SessionCredential,
  type SessionQueryRow,
  type SessionRow,
} from './session';
import {
  computeEffectivePermissions,
  type PermissionString,
  type StaffRole,
} from './permissions-shared';
import {
  effectivePermissionsForAuthorizationMode,
  resolveAuthorizationMode,
  type AuthorizationMode,
} from './authorization-mode';
import { ROLE_JSON_SQL, toRoleRow, type RoleRow } from './role-store';
import {
  resolveMobileDisplayConfig,
  type MobileDisplayConfig,
} from './mobile-display-config';
import { sessionUserCache } from './session-user-cache';

export interface CurrentUser {
  session: SessionRow;
  staffId: number;
  name: string;
  /** Active tenant for this request — propagated from staff_sessions. */
  organizationId: string;
  /** Primary role key (lowest-position assigned role, or the staff.role column if none). */
  role: StaffRole;
  /** Every role assigned to this staff, ordered by position ascending. */
  roles: ReadonlyArray<RoleRow>;
  permissions: Set<PermissionString>;
  /** Runtime policy selected for this organization. Strict is the default. */
  authorizationMode: AuthorizationMode;
  /** Role-derived source of truth, unchanged by the dogfood runtime policy. */
  storedPermissions: Set<PermissionString>;
  permissionsAdded: ReadonlyArray<string>;
  permissionsRemoved: ReadonlyArray<string>;
  /** Resolved mobile UI config (role defaults + per-staff override). */
  mobileDisplayConfig: MobileDisplayConfig;
  /** Profile photo id (`staff.avatar_photo_id`), or null. */
  avatarPhotoId: number | null;
  /** Signed-in email shown under the name on the account row. */
  email: string | null;
}

/** The session row plus the staff envelope — every column null when the staff row is gone. */
interface SessionUserRow extends SessionQueryRow {
  name: string | null;
  role: string | null;
  permissions_added: string[] | null;
  permissions_removed: string[] | null;
  mobile_display_config: unknown;
  avatar_photo_id: number | null;
  account_email: string | null;
  /** `staff_roles` assignments as role rows, position-ordered. */
  roles: RoleRow[];
}

/**
 * Session, staff overrides, account email and role assignments in ONE round
 * trip — the auth floor under every request. Held briefly in
 * `sessionUserCache` (session-user-cache.ts): a revocation or role/permission
 * write applies on the next request on the writing instance, and within the
 * cache TTL (10s default) everywhere else.
 *
 * Email lives in account_emails (verified, unique per address) —
 * accounts.primary_email is an unpopulated denormalized pointer. A staffer with
 * no email of their own in a shared-account org (`staffLoginModel = 'shared'`)
 * shows the org's umbrella account email; that lateral only runs when the
 * staffer's own lookup came back empty.
 */
const SESSION_USER_SQL = `
  SELECT ${SESSION_ROW_COLUMNS},
         st.name, st.role, st.permissions_added, st.permissions_removed,
         st.mobile_display_config, st.avatar_photo_id,
         COALESCE(ae.email, umbrella.email) AS account_email,
         COALESCE((
           SELECT json_agg(${ROLE_JSON_SQL} ORDER BY r.position ASC, r.id ASC)
             FROM staff_roles sr
             JOIN roles r ON r.id = sr.role_id
            WHERE sr.staff_id = s.staff_id
         ), '[]'::json) AS roles
    FROM staff_sessions s
    LEFT JOIN staff st ON st.id = s.staff_id
    LEFT JOIN LATERAL (
      SELECT NULLIF(x.email, '') AS email
        FROM account_emails x
       WHERE x.account_id = st.account_id
       ORDER BY (x.verified_at IS NULL), x.verified_at DESC, x.created_at DESC
       LIMIT 1
    ) ae ON TRUE
    LEFT JOIN LATERAL (
      SELECT u.email
        FROM memberships m
        JOIN account_emails u ON u.account_id = m.account_id
        JOIN organizations o ON o.id = m.org_id
       WHERE ae.email IS NULL
         AND st.id IS NOT NULL
         AND m.org_id = s.organization_id
         AND m.status = 'active'
         AND o.settings ->> 'staffLoginModel' = 'shared'
       ORDER BY m.created_at ASC,
                (u.verified_at IS NULL), u.verified_at DESC, u.created_at DESC
       LIMIT 1
    ) umbrella ON TRUE
   WHERE s.sid = $1 AND s.credential = $2
   LIMIT 1`;

function normalizeRoleKey(raw: string | null | undefined): StaffRole {
  const v = (raw ?? '').trim().toLowerCase();
  const known: ReadonlyArray<StaffRole> = [
    'packer', 'receiver', 'receiving', 'technician', 'sales',
    'shipper', 'inventory_manager', 'viewer', 'readonly', 'admin',
  ];
  return (known as ReadonlyArray<string>).includes(v) ? (v as StaffRole) : 'unknown';
}

function mergePermissions(
  roles: ReadonlyArray<RoleRow>,
  added: ReadonlyArray<string>,
  removed: ReadonlyArray<string>,
): Set<PermissionString> {
  // Single pure resolver lives in permissions-shared.ts so the admin UI,
  // server resolvers, and unit tests all agree on the merge order.
  return computeEffectivePermissions(roles, added, removed);
}

function buildCurrentUser(
  session: SessionRow,
  staff: SessionUserRow,
  roles: ReadonlyArray<RoleRow>,
): CurrentUser {
  // Primary role: first assigned role (already position-ordered).
  // Falls back to the staff.role column if no assignments exist. Falls back
  // to 'unknown' if neither.
  const primary = roles[0]?.key ?? staff.role ?? null;
  const role = normalizeRoleKey(primary);
  const added = staff.permissions_added ?? [];
  const removed = staff.permissions_removed ?? [];
  const authorizationMode = resolveAuthorizationMode(session.organizationId);
  const storedPermissions = mergePermissions(roles, added, removed);

  const mobileDisplayConfig = resolveMobileDisplayConfig({
    roles: roles.map((r) => ({ key: r.key, mobile_defaults: r.mobileDefaults })),
    staffOverride: staff.mobile_display_config ?? null,
  });

  return {
    session,
    staffId: session.staffId,
    // `??` alone lets an empty-string `staff.name` (or a missing staff row) reach the client as '', which renders as a bare dot avatar.
    name: staff.name?.trim() || `Staff #${session.staffId}`,
    organizationId: session.organizationId,
    role,
    roles,
    authorizationMode,
    storedPermissions,
    permissions: effectivePermissionsForAuthorizationMode(
      authorizationMode,
      storedPermissions,
    ),
    permissionsAdded: added,
    permissionsRemoved: removed,
    mobileDisplayConfig,
    avatarPhotoId: staff.avatar_photo_id ?? null,
    email: staff.account_email ?? null,
  };
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  return getCurrentUserBySid(readSessionSid(store));
}

export async function getCurrentUserBySid(
  sid: string | null | undefined,
  credential: SessionCredential = 'cookie',
): Promise<CurrentUser | null> {
  if (!isPlausibleSid(sid)) return null;
  const row = (await sessionUserCache.get(sid, credential, async () =>
    (await pool.query(SESSION_USER_SQL, [sid, credential])).rows[0] as SessionUserRow | undefined,
  )) as SessionUserRow | undefined;
  // Validity (revoked / expired / idle) is re-decided on every call, cached row or not.
  const { session } = await validateSessionRow(sid, row);
  if (!session || !row) return null;
  return buildCurrentUser(session, row, row.roles.map(toRoleRow));
}
