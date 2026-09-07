/**
 * Server-side permission helpers — DB-backed pieces of the auth system.
 *
 * Pure types and runtime sets live in `./permissions-shared.ts` (client-safe;
 * no `pg` import). This module re-exports everything from there and adds the
 * DB-using helpers.
 *
 * Phase 2b: the static role-permission matrix was deleted. All permission
 * resolution now reads `roles.permissions` from the DB via `role-store.ts`.
 */

import pool from '@/lib/db';
import { effectivePermissionsForStaff } from './role-store';
import {
  ALL_PERMISSIONS,
  PermissionDeniedError,
  type PermissionAction,
  type PermissionString,
  type StaffRole,
} from './permissions-shared';

export * from './permissions-shared';

// ─── Role resolver (60s in-process cache) ──────────────────────────────────

interface CacheEntry {
  role: StaffRole;
  expiresAt: number;
}
const cache = new Map<number, CacheEntry>();
const CACHE_TTL_MS = 60_000;

export async function getStaffRole(staffId: number): Promise<StaffRole> {
  if (!Number.isFinite(staffId) || staffId <= 0) return 'unknown';
  const cached = cache.get(staffId);
  if (cached && cached.expiresAt > Date.now()) return cached.role;

  try {
    const r = await pool.query(
      `SELECT role FROM staff WHERE id = $1 LIMIT 1`,
      [staffId],
    );
    const firstRow = r.rows[0] as { role: string | null } | undefined;
    const raw = (firstRow?.role || '').trim().toLowerCase();
    const known: ReadonlyArray<StaffRole> = [
      'packer', 'receiver', 'receiving', 'technician', 'sales',
      'shipper', 'inventory_manager', 'viewer', 'readonly', 'admin',
    ];
    const role: StaffRole = (known as ReadonlyArray<string>).includes(raw)
      ? (raw as StaffRole)
      : 'unknown';
    cache.set(staffId, { role, expiresAt: Date.now() + CACHE_TTL_MS });
    return role;
  } catch {
    return 'unknown';
  }
}

/**
 * Organization of a staff row (60s cached). Roles are org-scoped since
 * 2026-09-06, so permission resolution always needs the staff's org. Derived
 * from the STAFF ROW, never from caller input — a body-supplied staffId can
 * only ever resolve permissions in its own org. Returns null when the staff
 * row does not exist (callers must treat that as deny).
 */
const orgCache = new Map<number, { orgId: string | null; expiresAt: number }>();

async function getStaffOrgId(staffId: number): Promise<string | null> {
  const cached = orgCache.get(staffId);
  if (cached && cached.expiresAt > Date.now()) return cached.orgId;
  const r = await pool
    .query<{ organization_id: string | null }>(
      `SELECT organization_id FROM staff WHERE id = $1 LIMIT 1`,
      [staffId],
    )
    .catch(() => undefined);
  const orgId = r?.rows[0]?.organization_id ?? null;
  orgCache.set(staffId, { orgId, expiresAt: Date.now() + CACHE_TTL_MS });
  return orgId;
}

/**
 * Server-side gate: throws PermissionDeniedError if the staff lacks the
 * permission. Route handlers catch this and convert to 403 via
 * `permissionDeniedResponse`.
 *
 * Reads the effective permission set from the DB (roles + per-staff overrides);
 * matches what withAuth uses.
 */
export async function assertPermission(
  staffId: number | null | undefined,
  action: PermissionAction,
): Promise<{ role: StaffRole }> {
  const id = Number(staffId);
  const validId = Number.isFinite(id) && id > 0 ? id : 0;
  const role = await getStaffRole(validId);
  if (validId === 0) {
    throw new PermissionDeniedError(action, role, null);
  }
  // Org scope: derived from the staff row itself (see getStaffOrgId). A
  // missing staff row or missing org is DENY, never a global lookup — roles
  // are per-org and an org-less resolve would read another tenant's grants.
  const orgId = await getStaffOrgId(validId);
  if (!orgId) {
    throw new PermissionDeniedError(action, role, validId);
  }
  // Look up staff overrides so the check matches the DB-backed effective set.
  const overrides = await pool
    .query<{ permissions_added: string[] | null; permissions_removed: string[] | null }>(
      `SELECT permissions_added, permissions_removed FROM staff WHERE id = $1 LIMIT 1`,
      [validId],
    )
    .then((r) => r.rows[0])
    .catch(() => undefined);
  const effective = await effectivePermissionsForStaff(validId, orgId, {
    added: overrides?.permissions_added ?? [],
    removed: overrides?.permissions_removed ?? [],
  });
  if (!effective.has(action as PermissionString)) {
    throw new PermissionDeniedError(action, role, validId);
  }
  return { role };
}

/** Internal sanity check: verifies a PermissionString value is registered. */
export function isKnownPermissionString(s: string): s is PermissionString {
  return ALL_PERMISSIONS.has(s as PermissionString);
}
