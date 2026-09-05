/**
 * /settings/audit — admin-facing audit log viewer.
 *
 * Reads from `audit_logs` (the rich diff table written by withAuth's
 * audit-floor and by handlers via recordAudit). Filter by source/action,
 * paginate, expand a row to see the before/after JSON.
 *
 * Tenant scoping: audit_logs doesn't have organization_id yet (next
 * migration wave). For now we filter by actor_staff_id ∈ staff of this
 * tenant — which is correct because every audit row is attributable to a
 * staff member, and staff are already tenant-scoped. Once audit_logs
 * carries org_id directly we'll switch.
 *
 * Gated by admin.view_logs.
 */

import { requirePermission } from '@/lib/auth/page-guard';
import pool from '@/lib/db';
import { PageHeader } from '@/components/ui/pane-header';
import { Button } from '@/design-system/primitives';
import { AuditLogTable } from '@/components/settings/audit/AuditLogTable';
import type { AuditLogRow as AuditLogTableRow } from '@/lib/audit-log/audit-log-row';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';



interface AuditRow {
  id: number;
  created_at: Date;
  actor_staff_id: number | null;
  actor_name: string | null;
  actor_role: string | null;
  source: string;
  action: string;
  entity_type: string;
  entity_id: string;
  ip_address: string | null;
  metadata: unknown;
  before_data: unknown;
  after_data: unknown;
}

const PAGE_SIZE = 50;

/**
 * The five hand-written `AdminTableColumn` objects that used to live here are
 * gone (2026-09-05). Columns are DATA now: `field-catalog/audit-log.ts` names
 * the facts, `audit-log-resolve.ts` reads them, and the shared engine paints
 * them — so this page gained header sort, search and a Fields picker that the
 * second table engine was never going to grow for one surface.
 */

interface PageProps {
  searchParams: Promise<{ source?: string; action?: string; cursor?: string }>;
}

export default async function AuditPage({ searchParams }: PageProps) {
  const user = await requirePermission('admin.view_logs');
  const params = await searchParams;
  const source = params.source?.trim() || null;
  const action = params.action?.trim() || null;
  const cursor = Number(params.cursor) || null;

  // Filter by actors who belong to this tenant. JOIN staff to display the
  // actor name + role at the time of read (the audit row caches role at
  // write time, but the name is on staff).
  const whereParts: string[] = ['s.organization_id = $1'];
  const args: unknown[] = [user.organizationId];
  if (source) { args.push(source); whereParts.push(`a.source = $${args.length}`); }
  if (action) { args.push(action); whereParts.push(`a.action = $${args.length}`); }
  if (cursor) { args.push(cursor); whereParts.push(`a.id < $${args.length}`); }

  args.push(PAGE_SIZE + 1); // +1 so we know if there's a next page

  const r = await pool.query<AuditRow>(
    `SELECT a.id, a.created_at, a.actor_staff_id, s.name AS actor_name, a.actor_role,
            a.source, a.action, a.entity_type, a.entity_id, a.ip_address,
            a.metadata, a.before_data, a.after_data
       FROM audit_logs a
       LEFT JOIN staff s ON s.id = a.actor_staff_id
      WHERE ${whereParts.join(' AND ')}
      ORDER BY a.id DESC
      LIMIT $${args.length}`,
    args,
  );
  const rows = r.rows.slice(0, PAGE_SIZE);
  const hasMore = r.rows.length > PAGE_SIZE;
  const nextCursor = hasMore ? rows[rows.length - 1]?.id : null;
  const isSearching = Boolean(source || action);

  /*
    Narrow to the client ROW SHAPE at the boundary.

    `before_data` / `after_data` are JSON blobs no column paints; shipping them
    to the client for every row would be this page's largest payload by an order
    of magnitude. `created_at` becomes an ISO string for the same reason the row
    type says so — a `Date` across the RSC boundary is one more thing that can
    arrive as something else.
  */
  const tableRows: AuditLogTableRow[] = rows.map((row) => ({
    id: row.id,
    created_at: new Date(row.created_at).toISOString(),
    actor_staff_id: row.actor_staff_id,
    actor_name: row.actor_name,
    actor_role: row.actor_role,
    source: row.source,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id == null ? null : String(row.entity_id),
    ip_address: row.ip_address,
  }));

  return (
    <div className="min-h-screen bg-surface-canvas antialiased">
      <PageHeader title="Audit log" maxWidth="5xl" />
      <div className="mx-auto max-w-5xl space-y-4 px-6 py-6">
        <p className="text-sm text-text-soft">
          Every privileged write, every permission denial. Last {PAGE_SIZE} rows{source || action ? ' matching filter' : ''}.
        </p>

        <form className="flex flex-wrap items-center gap-2 rounded-none border border-border-soft bg-surface-card p-3 text-role-caption shadow-sm">
          <label className="flex items-center gap-2">
            <span className="font-medium text-text-soft">Source</span>
            <input
              name="source"
              defaultValue={source ?? ''}
              placeholder="e.g. receiving"
              className={cn("rounded-lg border border-border-soft bg-surface-card px-2.5 py-1 text-role-caption", focusRing('field', 'neutral'))}
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="font-medium text-text-soft">Action</span>
            <input
              name="action"
              defaultValue={action ?? ''}
              placeholder="e.g. mark_received"
              className={cn("rounded-lg border border-border-soft bg-surface-card px-2.5 py-1 text-role-caption", focusRing('field', 'neutral'))}
            />
          </label>
          <Button variant="brand" size="sm" type="submit">Apply</Button>
          {(source || action) && (
            <a href="/settings/audit" className="font-medium text-text-soft hover:text-text-default">Clear</a>
          )}
        </form>

        <AuditLogTable rows={tableRows} isSearching={isSearching} />

        {nextCursor && (
          <div className="text-right">
            <a
              className="inline-flex items-center rounded-2xl border border-border-soft bg-surface-card px-3 py-1.5 text-role-caption font-medium text-text-muted shadow-sm hover:text-text-default"
              href={`?${new URLSearchParams({
                ...(source ? { source } : {}),
                ...(action ? { action } : {}),
                cursor: String(nextCursor),
              }).toString()}`}
            >
              Older →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
