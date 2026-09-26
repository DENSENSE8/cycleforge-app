import 'server-only';

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { OrgTableRow } from '@/lib/tables/org-tables';

/** The per-org sheet catalog — stored decisions only. */

interface DbRow {
  table_id: string;
  enabled: boolean;
  sort_order: number;
}

export async function listOrgTables(orgId: OrgId): Promise<OrgTableRow[]> {
  const { rows } = await tenantQuery<DbRow>(
    orgId,
    `SELECT table_id, enabled, sort_order
       FROM org_tables
      WHERE organization_id = $1
      ORDER BY sort_order ASC, table_id ASC`,
    [orgId],
  );
  return rows.map((r) => ({
    tableId: r.table_id,
    enabled: r.enabled,
    sortOrder: r.sort_order,
  }));
}

/** Replace this org's catalog wholesale. */
export async function replaceOrgTables(
  orgId: OrgId,
  rows: readonly OrgTableRow[],
  staffId: number | null,
): Promise<OrgTableRow[]> {
  await tenantQuery(orgId, 'DELETE FROM org_tables WHERE organization_id = $1', [orgId]);
  if (rows.length === 0) return [];

  // One multi-row INSERT: a loop would be N round trips for a set that is
  // always tens of rows, and each would be its own transaction.
  const values: unknown[] = [orgId, staffId];
  const tuples = rows.map((row, i) => {
    const base = values.length;
    values.push(row.tableId, row.enabled, row.sortOrder);
    return `($1, $${base + 1}, $${base + 2}, $${base + 3}, $2, NOW())`;
  });

  const { rows: written } = await tenantQuery<DbRow>(
    orgId,
    `INSERT INTO org_tables
       (organization_id, table_id, enabled, sort_order, updated_by, updated_at)
     VALUES ${tuples.join(', ')}
     RETURNING table_id, enabled, sort_order`,
    values,
  );
  return written.map((r) => ({
    tableId: r.table_id,
    enabled: r.enabled,
    sortOrder: r.sort_order,
  }));
}
