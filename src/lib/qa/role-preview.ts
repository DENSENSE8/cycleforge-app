/**
 * Preview-as-role for the QA sandbox.
 *
 * Evaluates authorization the same way production does (computeEffectivePermissions
 * against the roles table). It does not accept a client-supplied staff_id, does
 * not mutate the session, and does not bypass step-up on high-risk permissions.
 */

import pool from '@/lib/db';
import { computeEffectivePermissions, STEP_UP_PERMISSIONS } from '@/lib/auth/permissions-shared';
import { PERMISSIONS, REGISTRY_DESTRUCTIVE_PERMISSIONS } from '@/lib/auth/permission-registry';
import { getSidebarNavItems } from '@/lib/sidebar-navigation';
import { QA_PREVIEW_ROLES } from './role-preview-roles';

export { QA_PREVIEW_ROLES, type QaPreviewRoleKey } from './role-preview-roles';

export interface RolePreview {
  role: { key: string; label: string };
  permissionCount: number;
  permissions: Array<{ id: string; label: string; stepUp: boolean; destructive: boolean }>;
  stepUp: string[];
  nav: Array<{ id: string; label: string; href: string }>;
  notes: string[];
}

export async function previewAsRole(roleKey: string, orgId: string): Promise<RolePreview> {
  const catalog = QA_PREVIEW_ROLES.find((r) => r.key === roleKey);
  if (!catalog) {
    throw Object.assign(new Error(`Unknown preview role: ${roleKey}`), { status: 400 });
  }

  // roles is org-scoped (2026-09-06): resolve the preview against the QA
  // org's own slice — a key-only lookup would fan out across every org.
  const r = await pool.query<{ key: string; label: string; permissions: string[] }>(
    `SELECT key, label, permissions FROM roles
      WHERE key = $1 AND organization_id = $2::uuid
      LIMIT 1`,
    [catalog.key, orgId],
  );
  const row = r.rows[0];
  const permissionsList = row?.permissions ?? [];
  const set = computeEffectivePermissions(
    [{ key: catalog.key, permissions: permissionsList }],
    [],
    [],
  );

  const permissions = PERMISSIONS.filter((p) => set.has(p.id)).map((p) => ({
    id: p.id,
    label: p.label,
    stepUp: Boolean((p as { stepUp?: boolean }).stepUp),
    destructive: Boolean((p as { destructive?: boolean }).destructive),
  }));

  const nav = getSidebarNavItems({
    permissions: set,
    organizationEnvironment: 'sandbox',
  }).map((item) => ({ id: item.id, label: item.label, href: item.href }));

  const stepUp = [...STEP_UP_PERMISSIONS].filter((id) => set.has(id));

  return {
    role: { key: catalog.key, label: catalog.label },
    permissionCount: set.size,
    permissions,
    stepUp,
    nav,
    notes: [
      'This is an authorization preview only. The signed-in staff session is unchanged.',
      'The client cannot submit an arbitrary staff_id.',
      stepUp.length
        ? `High-risk actions still require step-up: ${stepUp.slice(0, 6).join(', ')}${stepUp.length > 6 ? '…' : ''}.`
        : 'This role has no step-up permissions.',
      `${[...REGISTRY_DESTRUCTIVE_PERMISSIONS].filter((id) => set.has(id)).length} destructive permissions are in the set.`,
    ],
  };
}
