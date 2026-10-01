import pool from '@/lib/db';

export interface RepairActivityEntry {
  id: number;
  createdAt: string;
  action: string;
  source: string;
  actorName: string | null;
  actorRole: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

interface RepairActivityRow {
  id: number | string;
  created_at: Date | string;
  action: string;
  source: string;
  actor_name: string | null;
  actor_role: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

/** Tenant-scoped audit trail for one repair, newest first. */
export async function getRepairActivity(repairId: number, organizationId: string, limit = 100): Promise<RepairActivityEntry[]> {
  const result = await pool.query<RepairActivityRow>(
    `SELECT al.id,
            al.created_at,
            al.action,
            al.source,
            s.name AS actor_name,
            al.actor_role,
            al.before_data,
            al.after_data,
            al.metadata
       FROM audit_logs al
       LEFT JOIN staff s
         ON s.id = al.actor_staff_id
        AND s.organization_id = al.organization_id
      WHERE al.organization_id = $1
        AND lower(al.entity_type) = 'repair_service'
        AND al.entity_id = $2
      ORDER BY al.created_at DESC, al.id DESC
      LIMIT $3`,
    [organizationId, String(repairId), Math.max(1, Math.min(250, limit))],
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    action: row.action,
    source: row.source,
    actorName: row.actor_name,
    actorRole: row.actor_role,
    before: row.before_data,
    after: row.after_data,
    metadata: row.metadata,
  }));
}
