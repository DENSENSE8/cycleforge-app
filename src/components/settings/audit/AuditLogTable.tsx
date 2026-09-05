'use client';

/**
 * The audit log's page MOUNT — spreads the feed onto the one table.
 *
 * A client island by necessity, not by preference: `/settings/audit` is a React
 * Server Component that queries `audit_logs` directly, and the engine's header
 * sort, Fields picker and search are interactive. The SERVER still owns the
 * query, the tenant scope, the `?source=` / `?action=` filters and the cursor —
 * only the display crossed the boundary.
 *
 * The shape `UnshippedTable` already mounts: the page supplies no chrome.
 */

import { DataTable } from '@/components/tables/DataTable';
import { useAuditLogSpreadsheet } from '@/components/settings/audit/useAuditLogSpreadsheet';
import type { AuditLogRow } from '@/lib/audit-log/audit-log-row';

export function AuditLogTable({
  rows,
  isSearching = false,
}: {
  rows: readonly AuditLogRow[];
  /** A server-side `?source=` / `?action=` filter is narrowing the query. */
  isSearching?: boolean;
}) {
  const sheet = useAuditLogSpreadsheet({
    rows,
    emptyMessage: isSearching
      ? 'No audit entries match that filter.'
      : 'No audit entries yet.',
  });
  return <DataTable {...sheet} totalCount={rows.length} />;
}
