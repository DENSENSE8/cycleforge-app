/** Server-side helpers to resolve the current authenticated staff from the `cf_sid` session cookie. */

import { cookies } from 'next/headers';
import pool from '@/lib/db';
import { loadSession, readSessionSid, type SessionCredential, type SessionRow } from './session';
import { getOrSet } from '@/lib/cache/upstash-cache';
import { CACHE_NS, CACHE_TAGS } from '@/lib/cache/tags';
import { computeEffectivePermissions, type PermissionString, type StaffRole } from './permissions-shared';
import { loadRolesForStaff, type RoleRow } from './role-store';
import {
  resolveMobileDisplayConfig,
  type MobileDisplayConfig,
} from './mobile-display-config';

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
  permissionsAdded: ReadonlyArray<string>;
  permissionsRemoved: ReadonlyArray<string>;
  /** Resolved mobile UI config (role defaults + per-staff override). */
  mobileDisplayConfig: MobileDisplayConfig;
  /** Profile photo id (`staff.avatar_photo_id`), or null. */
  avatarPhotoId: number | null;
  /** Signed-in email shown under the name on the account row. */
  email: string | null;
}

interface StaffOverrideRow {
  name: string | null;
  role: string | null;
  permissions_added: string[] | null;
  permissions_removed: string[] | null;
  mobile_display_config: unknown;
  avatar_photo_id: number | null;
  account_email: string | null;
}

async function loadStaffOverrides(staffId: number, orgId: string): Promise<StaffOverrideRow | null> {
  // Auth hot path:
  try {
    return await getOrSet<StaffOverrideRow | null>(
      CACHE_NS.staffOverrides,
      orgId,
      String(staffId),
      30,
      [CACHE_TAGS.staffOverrides],
      async () => {
        // Email lives in account_emails (verified, unique per address) — accounts.primary_email is an unpopulated denormalized pointer.
        const r = await pool.query(
          `SELECT s.name, s.role, s.permissions_added, s.permissions_removed,
                 s.mobile_display_config, s.avatar_photo_id,
                 ae.email AS account_email
            FROM staff s
            LEFT JOIN LATERAL (
              SELECT x.email
                FROM account_emails x
               WHERE x.account_id = s.account_id
               ORDER BY (x.verified_at IS NULL), x.verified_at DESC, x.created_at DESC
               LIMIT 1
            ) ae ON TRUE
           WHERE s.id = $1
           LIMIT 1`,
          [staffId],
        );
        const row = (r.rows[0] as StaffOverrideRow | undefined) ?? null;
        if (!row || row.account_email) return row;
        // Shared-account org:
        try {
          const umbrella = await pool.query<{ email: string | null }>(
            `SELECT ae.email
               FROM memberships m
               JOIN account_emails ae ON ae.account_id = m.account_id
               JOIN organizations o ON o.id = m.org_id
              WHERE m.org_id = $1
                AND m.status = 'active'
                AND o.settings ->> 'staffLoginModel' = 'shared'
              ORDER BY m.created_at ASC,
                       (ae.verified_at IS NULL), ae.verified_at DESC, ae.created_at DESC
              LIMIT 1`,
            [orgId],
          );
          return { ...row, account_email: umbrella.rows[0]?.email ?? null };
        } catch {
          return row;
        }
      },
    );
  } catch {
    return null;
  }
}

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

async function buildCurrentUser(session: SessionRow | null): Promise<CurrentUser | null> {
  if (!session) return null;
  const [overrides, roles] = await Promise.all([
    loadStaffOverrides(session.staffId, session.organizationId),
    loadRolesForStaff(session.staffId),
  ]);
  // Primary role: first row from loadRolesForStaff (already position-ordered).
  // Falls back to the staff.role column if no assignments exist. Falls back
  // to 'unknown' if neither.
  const primary = roles[0]?.key ?? overrides?.role ?? null;
  const role = normalizeRoleKey(primary);
  const added = overrides?.permissions_added ?? [];
  const removed = overrides?.permissions_removed ?? [];

  const mobileDisplayConfig = resolveMobileDisplayConfig({
    roles: roles.map((r) => ({ key: r.key, mobile_defaults: r.mobileDefaults })),
    staffOverride: overrides?.mobile_display_config ?? null,
  });

  return {
    session,
    staffId: session.staffId,
    // `??` alone lets an empty-string `staff.name` (or a failed override load) reach the client as '', which renders as a bare dot avatar +…
    name: overrides?.name?.trim() || `Staff #${session.staffId}`,
    organizationId: session.organizationId,
    role,
    roles,
    permissions: mergePermissions(roles, added, removed),
    permissionsAdded: added,
    permissionsRemoved: removed,
    mobileDisplayConfig,
    avatarPhotoId: overrides?.avatar_photo_id ?? null,
    email: overrides?.account_email ?? null,
  };
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const sid = readSessionSid(store);
  const session = await loadSession(sid);
  return buildCurrentUser(session);
}

export async function getCurrentUserBySid(
  sid: string | null | undefined,
  credential: SessionCredential = 'cookie',
): Promise<CurrentUser | null> {
  const session = await loadSession(sid, credential);
  return buildCurrentUser(session);
}
