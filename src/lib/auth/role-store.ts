/**
 * Server-only in-process cache for the DB-defined `roles` table and
 * `staff_roles` assignments. Hot-path readers (current-user.ts, withAuth)
 * go through here instead of hitting the DB on every request.
 *
 * Since 2026-09-06 `roles` is ORG-SCOPED (roles.organization_id, RLS FORCEd,
 * UNIQUE (organization_id, key) — see 2026-09-06_roles_per_org.sql). Every
 * entry point here therefore takes a REQUIRED OrgId and the caches are keyed
 * by org first: a role key/id from another tenant is a different row and can
 * never leak through a shared snapshot.
 *
 * Cache invalidation is event-driven: the admin endpoints that mutate roles
 * or assignments call `invalidateRoleCache()` / `invalidateStaffRolesCache(id)`
 * after the write. A 60-second wall-clock TTL also expires entries naturally
 * so a missed invalidation can't strand the cluster on stale data.
 *
 * Why a Map and not react-cache or unstable_cache: this module is imported
 * by Node-only route handlers and by getCurrentUser(); we don't want
 * Next's request-scoped caching here — we want process-wide.
 */

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

interface RolesSnapshot {
  byId: Map<number, RoleRow>;
  byKey: Map<string, RoleRow>;
  orderedByPosition: RoleRow[];
  expiresAt: number;
}

/** One snapshot per org — the same role key in two orgs is two rows. */
const rolesCache = new Map<OrgId, RolesSnapshot>();
const inflightRoles = new Map<OrgId, Promise<RolesSnapshot>>();

/**
 * Load and cache an org's slice of `roles`. Single SELECT — the per-org table
 * is tiny (<100 rows typical), so we never page. Reads run on the owner pool
 * (BYPASSRLS) with an explicit organization_id predicate; the org key on the
 * cache, not RLS, is what keeps snapshots from bleeding across tenants here.
 */
async function fetchRoles(orgId: OrgId): Promise<RolesSnapshot> {
  const r = await pool.query(
    `SELECT id, key, label, color, position, permissions, is_system, mobile_defaults
       FROM roles
      WHERE organization_id = $1::uuid
      ORDER BY position ASC, id ASC`,
    [orgId],
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

async function getRolesSnapshot(orgId: OrgId): Promise<RolesSnapshot> {
  const cached = rolesCache.get(orgId);
  if (cached && cached.expiresAt > Date.now()) return cached;
  const inflight = inflightRoles.get(orgId);
  if (inflight) return inflight;
  const p = fetchRoles(orgId).then((snap) => {
    rolesCache.set(orgId, snap);
    inflightRoles.delete(orgId);
    return snap;
  }).catch((err) => {
    inflightRoles.delete(orgId);
    throw err;
  });
  inflightRoles.set(orgId, p);
  return p;
}

export function invalidateRoleCache(): void {
  rolesCache.clear();
}

// ─── Per-staff assignment cache ─────────────────────────────────────────

interface StaffAssignmentSnapshot {
  roleIds: number[];
  expiresAt: number;
}

const STAFF_ROLES_TTL_MS = 60_000;
/** Keyed `${orgId}:${staffId}` — assignments are only meaningful per org. */
const staffRolesCache = new Map<string, StaffAssignmentSnapshot>();

/**
 * Load role ids assigned to a staff, scoped to the staff's org. Order:
 * roles.position ASC (primary role first). Stale entries are refreshed on
 * next read; an explicit invalidate is used after writes for instant
 * correctness.
 *
 * Runs through `tenantQuery` (org GUC + tenant pool) and requires the
 * grant's `roles` row to belong to the SAME org as the staff parent, so a
 * stray cross-org grant row could never resolve even if one existed.
 */
async function loadStaffRoleIds(staffId: number, orgId: OrgId): Promise<number[]> {
  const cacheKey = `${orgId}:${staffId}`;
  const cached = staffRolesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.roleIds;
  const r = await tenantQuery<{ role_id: number }>(
    orgId,
    `SELECT sr.role_id
       FROM staff_roles sr
       JOIN roles r ON r.id = sr.role_id
       JOIN staff s ON s.id = sr.staff_id
      WHERE sr.staff_id = $1
        AND s.organization_id = $2::uuid
        AND r.organization_id = $2::uuid
      ORDER BY r.position ASC, r.id ASC`,
    [staffId, orgId],
  );
  const roleIds = r.rows.map((row) => row.role_id);
  staffRolesCache.set(cacheKey, { roleIds, expiresAt: Date.now() + STAFF_ROLES_TTL_MS });
  return roleIds;
}

export async function loadRolesForStaff(staffId: number, orgId: OrgId): Promise<RoleRow[]> {
  const [ids, snap] = await Promise.all([loadStaffRoleIds(staffId, orgId), getRolesSnapshot(orgId)]);
  const out: RoleRow[] = [];
  for (const id of ids) {
    const r = snap.byId.get(id);
    if (r) out.push(r);
  }
  return out;
}

export function invalidateStaffRolesCache(staffId?: number): void {
  if (staffId == null) {
    staffRolesCache.clear();
  } else {
    const suffix = `:${staffId}`;
    for (const key of staffRolesCache.keys()) {
      if (key.endsWith(suffix)) staffRolesCache.delete(key);
    }
  }
}

// ─── Effective permission helpers (server-side, DB-backed) ──────────────

/**
 * Computes the effective permission set for a staff: UNION of all assigned
 * role permissions ∪ `permissions_added` \ `permissions_removed`. If any
 * assigned role has key 'admin', short-circuits to "all known permissions".
 *
 * Mirrors Discord's Administrator bypass.
 */
export async function effectivePermissionsForStaff(
  staffId: number,
  orgId: OrgId,
  overrides: { added?: ReadonlyArray<string>; removed?: ReadonlyArray<string> } = {},
): Promise<Set<PermissionString>> {
  const roles = await loadRolesForStaff(staffId, orgId);
  return computeEffectivePermissions(roles, overrides.added ?? [], overrides.removed ?? []);
}
