/**
 * Server-only role lookups for a staff member (`staff_roles` → `roles`).
 *
 * Roles are read per staff (joined in one query), never as a whole-table
 * snapshot: the `roles` table grows with the number of orgs, and the auth hot
 * path (current-user.ts) already folds the staff's roles into its session read.
 * The unfiltered path keeps a short per-staff cache for the callers that ask
 * repeatedly (notifications fanout, kiosk step-up, pack verification).
 */

import pool from '@/lib/db';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  ALL_PERMISSIONS,
  computeEffectivePermissions,
  type PermissionString,
} from './permissions-shared';
import { resolveAuthorizationMode } from './authorization-mode';
import { invalidateSessionUserCache } from './session-user-cache';

export interface RoleRow {
  id: number;
  key: string;
  label: string;
  color: string;
  position: number;
  permissions: ReadonlyArray<string>;
  isSystem: boolean;
  /** Raw JSONB blob — shape validated lazily by mobile-display-config.ts. */
  mobileDefaults: unknown;
}

/** `roles r` columns as one JSON object per role — shared with current-user's session read. */
export const ROLE_JSON_SQL = `json_build_object(
  'id', r.id, 'key', r.key, 'label', r.label, 'color', r.color, 'position', r.position,
  'permissions', r.permissions, 'isSystem', r.is_system, 'mobileDefaults', r.mobile_defaults)`;

/** Normalize a `ROLE_JSON_SQL` object (null permissions/mobile_defaults → empty). */
export function toRoleRow(raw: RoleRow): RoleRow {
  return { ...raw, permissions: raw.permissions ?? [], mobileDefaults: raw.mobileDefaults ?? null };
}

const STAFF_ROLES_TTL_MS = 60_000;
const STAFF_ROLES_MAX_ENTRIES = 5_000;
const staffRolesCache = new Map<number, { roles: RoleRow[]; expiresAt: number }>();

const STAFF_ROLES_SQL = `SELECT ${ROLE_JSON_SQL} AS role
       FROM staff_roles sr
       JOIN roles r ON r.id = sr.role_id`;

/**
 * Roles assigned to a staff, position-ordered. With `orgId` the read runs
 * RLS-scoped and org-filtered and is never cached (security-filtered path), so
 * a filtered miss can never poison the unfiltered cache.
 */
export async function loadRolesForStaff(staffId: number, orgId?: OrgId): Promise<RoleRow[]> {
  if (orgId) {
    const r = await tenantQuery<{ role: RoleRow }>(
      orgId,
      `${STAFF_ROLES_SQL}
       JOIN staff s ON s.id = sr.staff_id
      WHERE sr.staff_id = $1 AND s.organization_id = $2
      ORDER BY r.position ASC, r.id ASC`,
      [staffId, orgId],
    );
    return r.rows.map((row) => toRoleRow(row.role));
  }
  const cached = staffRolesCache.get(staffId);
  if (cached && cached.expiresAt > Date.now()) return cached.roles;
  const r = await pool.query(
    `${STAFF_ROLES_SQL}
      WHERE sr.staff_id = $1
      ORDER BY r.position ASC, r.id ASC`,
    [staffId],
  );
  const roles = (r.rows as Array<{ role: RoleRow }>).map((row) => toRoleRow(row.role));
  staffRolesCache.delete(staffId);
  if (staffRolesCache.size >= STAFF_ROLES_MAX_ENTRIES) {
    const oldest = staffRolesCache.keys().next().value;
    if (oldest !== undefined) staffRolesCache.delete(oldest);
  }
  staffRolesCache.set(staffId, { roles, expiresAt: Date.now() + STAFF_ROLES_TTL_MS });
  return roles;
}

/** A role's definition changed (permissions, label, position…): every cached staff→roles read may be stale. */
export function invalidateRoleCache(): void {
  staffRolesCache.clear();
  invalidateSessionUserCache();
}

/** A staff's role assignments changed (or everyone's, with no arg). */
export function invalidateStaffRolesCache(staffId?: number): void {
  if (staffId == null) {
    staffRolesCache.clear();
    invalidateSessionUserCache();
  } else {
    staffRolesCache.delete(staffId);
    invalidateSessionUserCache({ staffId });
  }
}

// ─── Effective permission helpers (server-side, DB-backed) ──────────────

/** Computes the effective permission set for a staff: */
export async function effectivePermissionsForStaff(
  staffId: number,
  overrides: { added?: ReadonlyArray<string>; removed?: ReadonlyArray<string> } = {},
  orgId?: OrgId,
): Promise<Set<PermissionString>> {
  if (orgId && resolveAuthorizationMode(orgId) === 'authenticated-only') {
    return new Set(ALL_PERMISSIONS);
  }
  const roles = await loadRolesForStaff(staffId, orgId);
  return computeEffectivePermissions(roles, overrides.added ?? [], overrides.removed ?? []);
}
