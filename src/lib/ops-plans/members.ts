import type { PoolClient } from 'pg';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

export interface PlanMemberRow {
  planId: string;
  staffId: number;
  name: string;
  addedByStaffId: number | null;
  createdAt: string;
}

function mapMember(row: Record<string, unknown>): PlanMemberRow {
  return {
    planId: String(row.plan_id),
    staffId: Number(row.staff_id),
    name: String(row.name ?? ''),
    addedByStaffId: row.added_by_staff_id == null ? null : Number(row.added_by_staff_id),
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at ?? ''),
  };
}

async function verifyStaffInOrg(client: PoolClient, orgId: OrgId, staffId: number): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM staff WHERE id = $1 AND organization_id = $2::uuid AND COALESCE(active, true) = true LIMIT 1`,
    [staffId, orgId],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function listPlanMembers(
  orgId: OrgId,
  planId: string,
): Promise<PlanMemberRow[] | null> {
  const plan = await tenantQuery(
    orgId,
    `SELECT 1 FROM ops_plans WHERE organization_id = $1::uuid AND id = $2::uuid LIMIT 1`,
    [orgId, planId],
  );
  if ((plan.rowCount ?? 0) === 0) return null;
  const result = await tenantQuery(orgId,
    `SELECT m.plan_id, m.staff_id, s.name, m.added_by_staff_id, m.created_at
       FROM ops_plan_members m
       JOIN staff s ON s.id = m.staff_id AND s.organization_id = m.organization_id
      WHERE m.organization_id = $1::uuid AND m.plan_id = $2::uuid
      ORDER BY s.name ASC, m.staff_id ASC`,
    [orgId, planId],
  );
  return result.rows.map(mapMember);
}

export async function addPlanMember(
  orgId: OrgId,
  planId: string,
  staffId: number,
  addedByStaffId: number | null,
): Promise<PlanMemberRow | null> {
  return withTenantTransaction(orgId, async (client) => {
    const plan = await client.query(
      `SELECT id FROM ops_plans WHERE id = $1::uuid AND organization_id = $2::uuid`,
      [planId, orgId],
    );
    if (plan.rows.length === 0) return null;
    const ok = await verifyStaffInOrg(client, orgId, staffId);
    if (!ok) throw new Error('INVALID_ASSIGNEE');
    await client.query(
      `INSERT INTO ops_plan_members (organization_id, plan_id, staff_id, added_by_staff_id)
       VALUES ($1::uuid, $2::uuid, $3, $4)
       ON CONFLICT (organization_id, plan_id, staff_id) DO NOTHING`,
      [orgId, planId, staffId, addedByStaffId],
    );
    const row = await client.query(
      `SELECT m.plan_id, m.staff_id, s.name, m.added_by_staff_id, m.created_at
         FROM ops_plan_members m
         JOIN staff s ON s.id = m.staff_id AND s.organization_id = m.organization_id
        WHERE m.organization_id = $1::uuid AND m.plan_id = $2::uuid AND m.staff_id = $3`,
      [orgId, planId, staffId],
    );
    return row.rows[0] ? mapMember(row.rows[0]) : null;
  });
}

export async function removePlanMember(
  orgId: OrgId,
  planId: string,
  staffId: number,
): Promise<boolean> {
  const result = await tenantQuery(orgId,
    `DELETE FROM ops_plan_members
      WHERE organization_id = $1::uuid AND plan_id = $2::uuid AND staff_id = $3`,
    [orgId, planId, staffId],
  );
  return (result.rowCount ?? 0) > 0;
}

/** Insert members on the same client as plan create (uncommitted row). */
export async function insertPlanMembersOnClient(
  client: PoolClient,
  orgId: OrgId,
  planId: string,
  staffIds: readonly number[],
  addedByStaffId: number | null,
): Promise<void> {
  const unique = [...new Set(staffIds.filter((id) => Number.isInteger(id) && id > 0))];
  for (const staffId of unique) {
    const ok = await verifyStaffInOrg(client, orgId, staffId);
    if (!ok) throw new Error('INVALID_ASSIGNEE');
    await client.query(
      `INSERT INTO ops_plan_members (organization_id, plan_id, staff_id, added_by_staff_id)
       VALUES ($1::uuid, $2::uuid, $3, $4)
       ON CONFLICT (organization_id, plan_id, staff_id) DO NOTHING`,
      [orgId, planId, staffId, addedByStaffId],
    );
  }
}
