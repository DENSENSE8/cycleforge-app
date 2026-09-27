/** Server-only in-process cache for the DB-defined `roles` table and `staff_roles` assignments. */

import pool from '@/lib/db';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { computeEffectivePermissions, type PermissionString } from './permissions-shared';

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

const ROLE_TTL_MS = 60_000;

export interface RolesSnapshot {
  byId: Map<number, RoleRow>;
  byKey: Map<string, RoleRow>;
  orderedByPosition: RoleRow[];
  expiresAt: number;
}

let rolesCache: RolesSnapshot | null = null;
let inflightRoles: Promise<RolesSnapshot> | null = null;

/**
 * Load and cache the entire `roles` table. Single SELECT — the table is
 * tiny (<100 rows typical), so we never page.
 */
async function fetchRoles(): Promise<RolesSnapshot> {
  const r = await pool.query(
    `SELECT id, key, label, color, position, permissions, is_system, mobile_defaults
       FROM roles
      ORDER BY position ASC, id ASC`,
  );
  const rows: RoleRow[] = (r.rows as Array<{
    id: number; key: string; label: string; color: string;
    position: number; permissions: string[]; is_system: boolean;
    mobile_defaults: unknown;
  }>).map((row) => ({
    id: row.id,
    key: row.key,
    label: row.label,
    color: row.color,
    position: row.position,
    permissions: row.permissions || [],
    isSystem: row.is_system,
    mobileDefaults: row.mobile_defaults ?? null,
  }));

  const byId = new Map<number, RoleRow>();
  const byKey = new Map<string, RoleRow>();
  for (const role of rows) {
    byId.set(role.id, role);
    byKey.set(role.key, role);
  }
  return { byId, byKey, orderedByPosition: rows, expiresAt: Date.now() + ROLE_TTL_MS };
}

export async function getRolesSnapshot(): Promise<RolesSnapshot> {
  const now = Date.now();
  if (rolesCache && rolesCache.expiresAt > now) return rolesCache;
  if (inflightRoles) return inflightRoles;
  inflightRoles = fetchRoles().then((snap) => {
    rolesCache = snap;
    inflightRoles = null;
    return snap;
  }).catch((err) => {
    inflightRoles = null;
    throw err;
  });
  return inflightRoles;
}

export function invalidateRoleCache(): void {
  rolesCache = null;
}

// ─── Per-staff assignment cache ─────────────────────────────────────────

interface StaffAssignmentSnapshot {
  roleIds: number[];
  expiresAt: number;
}

const STAFF_ROLES_TTL_MS = 60_000;
const staffRolesCache = new Map<number, StaffAssignmentSnapshot>();

/**
 * Load role ids assigned to a staff.
 * path), so a security-filtered miss can never poison the unfiltered hot path.
 */
async function loadStaffRoleIds(staffId: number, orgId?: OrgId): Promise<number[]> {
  if (orgId) {
    const r = await tenantQuery<{ role_id: number }>(
      orgId,
      `SELECT sr.role_id
         FROM staff_roles sr
         JOIN roles r ON r.id = sr.role_id
         JOIN staff s ON s.id = sr.staff_id
        WHERE sr.staff_id = $1 AND s.organization_id = $2
        ORDER BY r.position ASC, r.id ASC`,
      [staffId, orgId],
    );
    return r.rows.map((row) => row.role_id);
  }
  const cached = staffRolesCache.get(staffId);
  if (cached && cached.expiresAt > Date.now()) return cached.roleIds;
  const r = await pool.query(
    `SELECT sr.role_id
       FROM staff_roles sr
       JOIN roles r ON r.id = sr.role_id
      WHERE sr.staff_id = $1
      ORDER BY r.position ASC, r.id ASC`,
    [staffId],
  );
  const roleIds = (r.rows as Array<{ role_id: number }>).map((row) => row.role_id);
  staffRolesCache.set(staffId, { roleIds, expiresAt: Date.now() + STAFF_ROLES_TTL_MS });
  return roleIds;
}

/** Assigned role ids → role rows, in the ids' order; ids missing from the snapshot are dropped. */
export function pickRoles(snap: RolesSnapshot, ids: ReadonlyArray<number>): RoleRow[] {
  const out: RoleRow[] = [];
  for (const id of ids) {
    const r = snap.byId.get(id);
    if (r) out.push(r);
  }
  return out;
}

export async function loadRolesForStaff(staffId: number, orgId?: OrgId): Promise<RoleRow[]> {
  const [ids, snap] = await Promise.all([loadStaffRoleIds(staffId, orgId), getRolesSnapshot()]);
  return pickRoles(snap, ids);
}

export function invalidateStaffRolesCache(staffId?: number): void {
  if (staffId == null) {
    staffRolesCache.clear();
  } else {
    staffRolesCache.delete(staffId);
  }
}

// ─── Effective permission helpers (server-side, DB-backed) ──────────────

/** Computes the effective permission set for a staff: */
export async function effectivePermissionsForStaff(
  staffId: number,
  overrides: { added?: ReadonlyArray<string>; removed?: ReadonlyArray<string> } = {},
  orgId?: OrgId,
): Promise<Set<PermissionString>> {
  const roles = await loadRolesForStaff(staffId, orgId);
  return computeEffectivePermissions(roles, overrides.added ?? [], overrides.removed ?? []);
}

