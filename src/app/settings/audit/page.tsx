/**
 * /settings/audit — admin-facing audit log viewer.
 *
 * Reads from `audit_logs` (the rich diff table written by withAuth's
 * audit-floor and by handlers via recordAudit). Filter by source/action and
 * walk keyset pages of fifty.
 *
 * There is NO row expansion. `metadata` / `before_data` / `after_data` are
 * written by `recordAudit`, selected below, and painted by nothing: this
 * docblock promised "expand a row to see the before/after JSON" for a plane
 * that was never built, and the sentence is gone rather than left standing as
 * a feature claim (corrected 2026-09-12, Wave D). The day a diff plane ships
 * it arrives with its own catalog facts.
 *
 * The table is the registered `audit-log` slot family, mounted through the
 * client island `./AuditLogTable`: the guard, the query and the pagination
 * stay here on the server, and only the rows cross the boundary.
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
import { SettingsSectionHeader } from '@/components/settings/SettingsSectionHeader';
import { SETTINGS_FLOOR_CLASS } from '@/components/settings/settings-sections';
import { Button } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { toAuditLogRow, type AuditLogQueryRow } from '@/lib/audit/audit-log-row';
import { AuditLogTable } from './AuditLogTable';

const PAGE_SIZE = 50;

/*
  The five hand-written second-engine column objects that used to live here
  are gone. Columns are DATA now: `field-catalog/audit-log.ts` names the eight
  facts those five cells carried, `audit-log-resolve.ts` reads them, and the
  shared engine paints them — so this desk gained header sort, search and a
  Fields picker the second table engine was never going to grow for one page.
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

  const r = await pool.query<AuditLogQueryRow>(
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
  const page = r.rows.slice(0, PAGE_SIZE);
  const hasMore = r.rows.length > PAGE_SIZE;
  const nextCursor = hasMore ? page[page.length - 1]?.id : null;
  const isSearching = Boolean(source || action);
  // Narrow to the wire row at the boundary: `created_at` becomes an ISO string
  // and the three unpainted JSONB blobs are dropped rather than shipped to the
  // client fifty times over. See `@/lib/audit/audit-log-row`.
  const rows = page.map(toAuditLogRow);

  return (
    <div className={cn('min-h-screen antialiased', SETTINGS_FLOOR_CLASS)}>
      <div className="mx-auto max-w-5xl space-y-4 px-6 py-6">
        <SettingsSectionHeader title="Audit log" />
        <p className="text-sm text-text-soft">
          Every privileged write, every permission denial. Last {PAGE_SIZE} rows{source || action ? ' matching filter' : ''}.
        </p>

        {/*
          PAGE CHROME, and deliberately still an HTML GET form: `?source=` and
          `?action=` narrow the SERVER query and the keyset cursor, which the
          table's own filter menu cannot do — it filters the fifty rows in hand.
          Folding these two into the Fields/filter menu means teaching that menu
          to write server params, and that is its own brief. FOLLOW-UP.
        */}
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

        <AuditLogTable
          rows={rows}
          emptyMessage={isSearching ? 'No audit entries match.' : 'No audit entries yet.'}
        />

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
