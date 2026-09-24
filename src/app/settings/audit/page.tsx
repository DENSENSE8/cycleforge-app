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
 * `?q=` is the FETCH KEY for that island's find box, which is why it is read
 * here. The island writes it (optimistically, through `useOptimisticUrlParam`)
 * and declares the search server-answered, so the engine runs no second pass.
 * Until this page spent the round-trip, the box filtered the FIFTY rows the
 * keyset page happened to hold: `audit_logs` carries 25k rows for this tenant,
 * `scan_out` first appears at rank 274 and `sku_catalog` at rank 17018, so the
 * desk answered "no audit entries match" for hundreds of writes that exist.
 * The predicate below runs over the same eight facts the row adapter paints.
 *
 * Tenant scoping: `orgId` comes from the auth ctx (`requirePermission` →
 * `user.organizationId`), never from a param, and the read goes through
 * `tenantQuery` — which sets `app.current_org` for the statement, so
 * `audit_logs`' `tenant_isolation` RLS policy bites — with an explicit
 * `a.organization_id = $1` predicate beside it, because RLS does not bite on
 * the owner pool. The actor-side `s.organization_id = $1` stays: it is this
 * feed's membership rule (an audited write is shown to the tenant whose staff
 * made it), not its tenant scope, and widening the feed to actorless system
 * rows is a different brief.
 *
 * Gated by admin.view_logs.
 */

import { requirePermission } from '@/lib/auth/page-guard';
import { tenantQuery } from '@/lib/tenancy/db';
import { SettingsSectionHeader } from '@/components/settings/SettingsSectionHeader';
import { SETTINGS_FLOOR_CLASS } from '@/components/settings/settings-sections';
import { Button } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { escapeLike } from '@/lib/sql-like';
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
  searchParams: Promise<{ source?: string; action?: string; cursor?: string; q?: string }>;
}

export default async function AuditPage({ searchParams }: PageProps) {
  const user = await requirePermission('admin.view_logs');
  const params = await searchParams;
  const source = params.source?.trim() || null;
  const action = params.action?.trim() || null;
  const cursor = Number(params.cursor) || null;
  /**
   * The island's find box, verbatim. Whitespace-only is NO query, not a query
   * for spaces — the box is cleared by deleting its text, and a lone space left
   * behind must not empty the log.
   */
  const query = params.q?.trim() || null;

  // Filter by actors who belong to this tenant. JOIN staff to display the
  // actor name + role at the time of read (the audit row caches role at
  // write time, but the name is on staff).
  const whereParts: string[] = ['a.organization_id = $1', 's.organization_id = $1'];
  const args: unknown[] = [user.organizationId];
  if (source) { args.push(source); whereParts.push(`a.source = $${args.length}`); }
  if (action) { args.push(action); whereParts.push(`a.action = $${args.length}`); }
  if (query) {
    // escapeLike armours the pattern; backslash is LIKE's default escape char,
    // so no ESCAPE clause is needed (see `@/lib/sql-like`).
    args.push(`%${escapeLike(query)}%`);
    const like = `$${args.length}`;
    // The eight facts `audit-log-resolve.ts` paints, and nothing else: matching
    // a column the desk does not show would hand back rows whose match is
    // invisible. `created_at` is absent on purpose — the cell paints "Sep 22" /
    // "14:03:07", so ILIKE over its ISO text would answer for a string no row
    // on screen contains. The four NOT NULL columns skip COALESCE.
    whereParts.push(`(
           a.action                     ILIKE ${like}
        OR a.source                     ILIKE ${like}
        OR a.entity_type                ILIKE ${like}
        OR a.entity_id                  ILIKE ${like}
        OR COALESCE(s.name, '')         ILIKE ${like}
        OR COALESCE(a.actor_role, '')   ILIKE ${like}
        OR COALESCE(a.ip_address, '')   ILIKE ${like}
      )`);
  }
  // LAST, after the find predicate: the cursor walks the MATCHED set, so a
  // page of fifty is fifty matches rather than fifty rows that were then
  // thinned. The island deletes `?cursor=` whenever the query text changes —
  // otherwise the operator would search from the middle of a list that no
  // longer exists.
  if (cursor) { args.push(cursor); whereParts.push(`a.id < $${args.length}`); }

  args.push(PAGE_SIZE + 1); // +1 so we know if there's a next page

  const r = await tenantQuery<AuditLogQueryRow>(
    user.organizationId,
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
  // Over the MATCHED set: the LIMIT+1 probe runs after the WHERE, so "Older →"
  // is offered only when a fifty-first MATCH exists. A pager built on the
  // unfiltered count would offer a page with nothing on it.
  const nextCursor = hasMore ? page[page.length - 1]?.id : null;
  const isSearching = Boolean(source || action || query);
  // Narrow to the wire row at the boundary: `created_at` becomes an ISO string
  // and the three unpainted JSONB blobs are dropped rather than shipped to the
  // client fifty times over. See `@/lib/audit/audit-log-row`.
  const rows = page.map(toAuditLogRow);

  return (
    <div className={cn('min-h-screen antialiased', SETTINGS_FLOOR_CLASS)}>
      <div className="mx-auto max-w-5xl space-y-4 px-6 py-6">
        <SettingsSectionHeader title="Audit log" />
        <p className="text-sm text-text-soft">
          Every privileged write, every permission denial. Last {PAGE_SIZE} rows{isSearching ? ' matching filter' : ''}.
        </p>

        {/*
          PAGE CHROME, and deliberately still an HTML GET form: `?source=` and
          `?action=` narrow the SERVER query and the keyset cursor, which the
          table's own filter menu cannot do — it filters the fifty rows in hand.
          Folding these two into the Fields/filter menu means teaching that menu
          to write server params, and that is its own brief. FOLLOW-UP.

          `?q=` rides a HIDDEN input because a GET form submits its own fields
          and nothing else: without it, pressing Apply would silently empty the
          table's find box, which is a param this form does not own.
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
          <input type="hidden" name="q" value={query ?? ''} />
          <Button variant="brand" size="sm" type="submit">Apply</Button>
          {(source || action) && (
            // Clears the two params this FORM owns and keeps the find text —
            // the box has its own clear affordance.
            <a
              href={query ? `/settings/audit?${new URLSearchParams({ q: query }).toString()}` : '/settings/audit'}
              className="font-medium text-text-soft hover:text-text-default"
            >
              Clear
            </a>
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
                ...(query ? { q: query } : {}),
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
