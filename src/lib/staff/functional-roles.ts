/**
 * Floor functional roles (picker, packer) — what a staff member DOES, stored
 * in `staff_functional_roles`, apart from RBAC access roles (`staff_roles`).
 * Non-exclusive: granting packer never revokes picker.
 */

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { StaffFunctionalRoleKey } from '@/lib/schemas/staff-functional-roles';

type SetStaffFunctionalRoleResult =
  | { status: 'not_found' }
  | { status: 'ok'; staffId: number; roles: StaffFunctionalRoleKey[]; changed: boolean };

export async function setStaffFunctionalRole(
  organizationId: OrgId,
  staffId: number,
  role: StaffFunctionalRoleKey,
  enabled: boolean,
  actorStaffId: number | null,
): Promise<SetStaffFunctionalRoleResult> {
  return withTenantTransaction(organizationId, async (client) => {
    const found = await client.query(
      `SELECT 1 FROM staff WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [staffId, organizationId],
    );
    if (found.rowCount === 0) return { status: 'not_found' as const };

    const write = enabled
      ? await client.query(
          `INSERT INTO staff_functional_roles (organization_id, staff_id, role_key, created_by_staff_id)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING`,
          [organizationId, staffId, role, actorStaffId],
        )
      : await client.query(
          `DELETE FROM staff_functional_roles
            WHERE organization_id = $1 AND staff_id = $2 AND role_key = $3`,
          [organizationId, staffId, role],
        );

    const rows = await client.query<{ role_key: StaffFunctionalRoleKey }>(
      `SELECT role_key FROM staff_functional_roles
        WHERE organization_id = $1 AND staff_id = $2
        ORDER BY role_key`,
      [organizationId, staffId],
    );
    return {
      status: 'ok' as const,
      staffId,
      roles: rows.rows.map((r) => r.role_key),
      changed: (write.rowCount ?? 0) > 0,
    };
  });
}
