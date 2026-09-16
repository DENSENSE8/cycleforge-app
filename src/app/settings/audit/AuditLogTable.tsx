'use client';

/**
 * Settings › Audit — the CLIENT ISLAND for `/settings/audit`.
 *
 * The page is an RSC: it guards on `admin.view_logs`, runs the tenant-scoped
 * `audit_logs` query and walks its keyset pages. None of that moves. This file
 * is only the boundary the slot engine needs (hooks, layout cascade, header
 * sort), and it takes its rows as props — the SQL stays on the server.
 *
 * Same shape as `../../inventory/returns/RecentReturnsTable.tsx`: spread
 * the family's feed onto DataTable and nothing else. No record plane — the
 * binding says why (`AUDITLOG_TABLE_BINDING.recordPlane`).
 */

import { DataTable } from '@/components/tables/DataTable';
import { useAuditLogSpreadsheet } from '@/components/settings/audit-log/useAuditLogSpreadsheet';
import type { AuditLogRow } from '@/lib/audit/audit-log-row';

export function AuditLogTable({
  rows,
  emptyMessage,
}: {
  rows: AuditLogRow[];
  /** The page owns the filtered-vs-empty wording; it knows the search params. */
  emptyMessage: string;
}) {
  const sheet = useAuditLogSpreadsheet({ rows, emptyMessage });

  return (
    <div className="flex h-[60vh] min-h-0 min-w-0 flex-col">
      <DataTable {...sheet} totalCount={rows.length} />
    </div>
  );
}
