import { requirePermission } from '@/lib/auth/page-guard';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { escapeLike } from '@/lib/sql-like';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/pane-header';
import { Button } from '@/design-system/primitives';
import type { PulseEventRow } from '@/components/inventory/types';
import { EventsExplorerTable } from './EventsExplorerTable';

export const dynamic = 'force-dynamic';

/**
 * /inventory/events — Global inventory_events explorer.
 *
 * Server-rendered filters with URL-query composition. The grid is the same
 * `inventory-events` family Pulse mounts — this page is a second FEED, not a
 * second table. Pagination is offset-based via ?page=N (zero-indexed).
 *
 * Query params:
 *   event_type   one of the canonical event_type values
 *   station      RECEIVING | TECH | PACK | SHIP | MOBILE | SYSTEM
 *   sku          exact match
 *   unit         serial_units.id (numeric)
 *   since        ISO date (YYYY-MM-DD) — inclusive lower bound
 *   until        ISO date — exclusive upper bound (so "today" = today+1)
 *   actor        staff.id (numeric)
 *   q            the table's find box — substring, over every painted fact
 *   page         zero-indexed page number
 *
 * `?q=` is the FETCH KEY for the client island's find box (it writes the param
 * through `useOptimisticUrlParams` and declares the search server-answered).
 * Until this loader spent it, the box filtered the HUNDRED rows one offset page
 * happened to hold, and said so in its placeholder: this tenant has 8.8k
 * events, `PUTAWAY` first appears at rank 2266 and a "Supplemental serial" note
 * at rank 7450, so the desk answered "no events match" for thousands of records
 * that exist. The predicate in {@link loadEvents} runs over the same eleven
 * facts `inventory-events-resolve.ts` paints, and the COUNT beside it runs over
 * the matched set so the pager cannot offer a page with nothing on it.
 *
 * Tenant scoping: every read goes through `tenantQuery(orgId, …)` with an
 * explicit `organization_id` predicate, and `orgId` comes from the auth ctx.
 */

const PAGE_SIZE = 100;

const EVENT_TYPES = [
  'RECEIVED', 'TEST_START', 'TEST_PASS', 'TEST_FAIL',
  'PUTAWAY', 'MOVED',
  'ALLOCATED', 'PICKED', 'PACKED', 'LABELED', 'STAGED', 'SHIPPED',
  'RETURNED', 'SCRAPPED', 'HELD', 'RELEASED_HOLD', 'RELEASED',
  'ADJUSTED', 'LISTED', 'NOTE',
  'TRIAGED', 'REPAIR_STARTED', 'REPAIR_COMPLETED', 'GRADED',
] as const;

const STATIONS = ['RECEIVING', 'TECH', 'PACK', 'SHIP', 'MOBILE', 'SYSTEM'] as const;

interface EventRow {
  id: number;
  occurred_at: Date | string;
  event_type: string;
  station: string | null;
  sku: string | null;
  product_title: string | null;
  serial_unit_id: number | null;
  serial_number: string | null;
  prev_status: string | null;
  next_status: string | null;
  actor_staff_id: number | null;
  actor_name: string | null;
  receiving_id: number | null;
  receiving_line_id: number | null;
  bin_id: number | null;
  bin_name: string | null;
  prev_bin_id: number | null;
  prev_bin_name: string | null;
  notes: string | null;
  payload: Record<string, unknown> | null;
}

interface StaffOption { id: number; name: string }

function toPulseEvent(row: EventRow): PulseEventRow {
  const occurred =
    row.occurred_at instanceof Date ? row.occurred_at.toISOString() : String(row.occurred_at);
  return {
    id: row.id,
    occurred_at: occurred,
    event_type: row.event_type,
    actor_staff_id: row.actor_staff_id,
    actor_name: row.actor_name,
    station: row.station,
    sku: row.sku,
    product_title: row.product_title,
    serial_unit_id: row.serial_unit_id,
    serial_number: row.serial_number,
    bin_id: row.bin_id,
    bin_name: row.bin_name,
    prev_bin_id: row.prev_bin_id,
    prev_bin_name: row.prev_bin_name,
    prev_status: row.prev_status,
    next_status: row.next_status,
    notes: row.notes,
    payload: row.payload && typeof row.payload === 'object' ? row.payload : {},
    receiving_id: row.receiving_id,
    receiving_line_id: row.receiving_line_id,
  };
}

async function loadStaff(orgId: OrgId): Promise<StaffOption[]> {
  try {
    const r = await tenantQuery<StaffOption>(
      orgId,
      `SELECT id, name
         FROM staff
        WHERE active = true AND organization_id = $1
        ORDER BY name ASC`,
      [orgId],
    );
    return r.rows;
  } catch {
    return [];
  }
}

async function loadEvents(opts: {
  eventType: string | null;
  station: string | null;
  sku: string | null;
  unitId: number | null;
  actorId: number | null;
  since: string | null;
  until: string | null;
  query: string | null;
  page: number;
  orgId: OrgId;
}): Promise<{ rows: EventRow[]; total: number }> {
  const filters: string[] = ['ie.organization_id = $1'];
  const params: unknown[] = [opts.orgId];

  if (opts.eventType) {
    params.push(opts.eventType);
    filters.push(`ie.event_type = $${params.length}`);
  }
  if (opts.station) {
    params.push(opts.station);
    filters.push(`ie.station = $${params.length}`);
  }
  if (opts.sku) {
    params.push(opts.sku);
    filters.push(`ie.sku = $${params.length}`);
  }
  if (opts.unitId != null) {
    params.push(opts.unitId);
    filters.push(`ie.serial_unit_id = $${params.length}`);
  }
  if (opts.actorId != null) {
    params.push(opts.actorId);
    filters.push(`ie.actor_staff_id = $${params.length}`);
  }
  if (opts.since) {
    params.push(opts.since);
    filters.push(`ie.occurred_at >= $${params.length}::date`);
  }
  if (opts.until) {
    params.push(opts.until);
    filters.push(`ie.occurred_at < ($${params.length}::date + INTERVAL '1 day')`);
  }
  if (opts.query) {
    // escapeLike armours the pattern; backslash is LIKE's default escape char,
    // so no ESCAPE clause is needed (see `@/lib/sql-like`).
    params.push(`%${escapeLike(opts.query)}%`);
    const like = `$${params.length}`;
    // The facts `inventory-events-resolve.ts` paints, and only those: the SKU
    // cell prints "SKU · title" so both halves have to answer, the bin and
    // status cells print a `prev → next` pair so both ends do, and the notes
    // line is searched raw (the resolver's "Supplemental serial X" rewrite is a
    // display face; the stored text is what an operator pasted from).
    filters.push(`(
           ie.event_type                    ILIKE ${like}
        OR COALESCE(ie.station, '')         ILIKE ${like}
        OR COALESCE(ie.sku, '')             ILIKE ${like}
        OR COALESCE(sc.product_title, '')   ILIKE ${like}
        OR COALESCE(su.serial_number, '')   ILIKE ${like}
        OR COALESCE(ie.prev_status, '')     ILIKE ${like}
        OR COALESCE(ie.next_status, '')     ILIKE ${like}
        OR COALESCE(l.name, '')             ILIKE ${like}
        OR COALESCE(pl.name, '')            ILIKE ${like}
        OR COALESCE(s.name, '')             ILIKE ${like}
        OR COALESCE(ie.notes, '')           ILIKE ${like}
      )`);
  }
  const whereSql = `WHERE ${filters.join(' AND ')}`;

  /**
   * The five enrichment joins, as ONE string, because the count and the page
   * must read the same FROM: five of the eleven facts the find predicate
   * matches live on a joined table, and a count that omitted them would either
   * fail to parse or answer for a different set than the rows. Every join is
   * on a unique key (`staff`/`locations`/`serial_units` by id,
   * `sku_catalog` by `(organization_id, sku)`), so none of them fans a row out
   * and `COUNT(*)` stays a count of events.
   */
  const joinSql = `
        LEFT JOIN staff s ON s.id = ie.actor_staff_id AND s.organization_id = $1
        LEFT JOIN locations l ON l.id = ie.bin_id AND l.organization_id = $1
        LEFT JOIN locations pl ON pl.id = ie.prev_bin_id AND pl.organization_id = $1
        LEFT JOIN serial_units su ON su.id = ie.serial_unit_id AND su.organization_id = $1
        LEFT JOIN sku_catalog sc ON sc.sku = ie.sku AND sc.organization_id = $1`;

  try {
    // Counted over the MATCHED set — this is the number the header prints and
    // the number `totalPages` divides, so the pager offers a "next →" only when
    // a next page of MATCHES exists. Without the find predicate there is
    // nothing on a joined table to filter by, so the count skips the joins and
    // stays the single-table scan it has always been.
    const countSql = `SELECT COUNT(*)::int AS n FROM inventory_events ie${
      opts.query ? joinSql : ''
    } ${whereSql}`;
    const countParams = [...params];
    const countRes = await tenantQuery<{ n: number }>(opts.orgId, countSql, countParams);
    const total = countRes.rows[0]?.n ?? 0;

    params.push(PAGE_SIZE);
    params.push(opts.page * PAGE_SIZE);

    const rowsSql = `
      SELECT ie.id, ie.occurred_at, ie.event_type, ie.station,
             ie.sku, sc.product_title,
             ie.serial_unit_id, su.serial_number,
             ie.prev_status, ie.next_status,
             ie.actor_staff_id, s.name AS actor_name,
             ie.receiving_id, ie.receiving_line_id,
             ie.bin_id, l.name AS bin_name,
             ie.prev_bin_id, pl.name AS prev_bin_name,
             ie.notes, ie.payload
        FROM inventory_events ie${joinSql}
        ${whereSql}
       ORDER BY ie.occurred_at DESC, ie.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}
    `;
    const r = await tenantQuery<EventRow>(opts.orgId, rowsSql, params);
    return { rows: r.rows, total };
  } catch {
    return { rows: [], total: 0 };
  }
}

function parseInteger(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
}

function parseISODate(value: string | undefined): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  return value.trim();
}

function buildPageHref(
  base: Record<string, string | null>,
  page: number,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) {
    if (v != null && v !== '') sp.set(k, v);
  }
  if (page > 0) sp.set('page', String(page));
  const qs = sp.toString();
  return qs ? `/inventory/events?${qs}` : '/inventory/events';
}

export default async function EventsExplorerPage({
  searchParams,
}: {
  searchParams: Promise<{
    event_type?: string;
    station?: string;
    sku?: string;
    unit?: string;
    actor?: string;
    since?: string;
    until?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const user = await requirePermission('admin.view', { enforce: true });
  const orgId = user.organizationId;

  const params = await searchParams;
  const eventType = EVENT_TYPES.includes(params.event_type as (typeof EVENT_TYPES)[number])
    ? (params.event_type ?? null) : null;
  const station = STATIONS.includes(params.station as (typeof STATIONS)[number])
    ? (params.station ?? null) : null;
  const sku = (params.sku ?? '').trim() || null;
  const unitId = parseInteger(params.unit);
  const actorId = parseInteger(params.actor);
  const since = parseISODate(params.since);
  const until = parseISODate(params.until);
  /**
   * The table's find box, verbatim. Whitespace-only is NO query, not a query
   * for spaces — the box is cleared by deleting its text, and a lone space left
   * behind must not empty the log.
   */
  const query = (params.q ?? '').trim() || null;
  const page = Math.max(0, parseInteger(params.page) ?? 0);

  const [staff, { rows, total }] = await Promise.all([
    loadStaff(orgId),
    loadEvents({ eventType, station, sku, unitId, actorId, since, until, query, page, orgId }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const baseQuery = {
    event_type: eventType,
    station,
    sku,
    unit: unitId != null ? String(unitId) : null,
    actor: actorId != null ? String(actorId) : null,
    since,
    until,
    // Carried by prev/next: a pager that dropped the find text would walk the
    // UNFILTERED log from page two on, under a header still counting matches.
    q: query,
  };
  const isFiltering = Boolean(
    eventType || station || sku || unitId != null || actorId != null || since || until || query,
  );
  const events = rows.map(toPulseEvent);

  return (
    <div className="min-h-screen bg-surface-canvas">
      <PageHeader backHref="/inventory/health" title="Inventory events" />
      <div className="space-y-6 p-8">
        <p className="text-sm text-text-muted">
          Global event log. Filters compose; the URL is shareable.
        </p>

        <form action="/inventory/events" method="get" className="grid grid-cols-2 gap-3 rounded-lg border border-border-soft bg-surface-card p-4 shadow-sm md:grid-cols-4">
          <div>
            <label htmlFor="event_type" className="block text-xs font-medium text-text-muted">Event type</label>
            <select id="event_type" name="event_type" defaultValue={eventType ?? ''} className="mt-1 block w-full rounded-md border border-border-default px-2 py-1.5 text-sm">
              <option value="">any</option>
              {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="station" className="block text-xs font-medium text-text-muted">Station</label>
            <select id="station" name="station" defaultValue={station ?? ''} className="mt-1 block w-full rounded-md border border-border-default px-2 py-1.5 text-sm">
              <option value="">any</option>
              {STATIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="sku" className="block text-xs font-medium text-text-muted">SKU</label>
            <input id="sku" name="sku" defaultValue={sku ?? ''} placeholder="exact SKU" className="mt-1 block w-full rounded-md border border-border-default px-2 py-1.5 font-mono text-xs" />
          </div>
          <div>
            <label htmlFor="unit" className="block text-xs font-medium text-text-muted">Unit id</label>
            <input id="unit" name="unit" defaultValue={unitId != null ? String(unitId) : ''} placeholder="serial_units.id" className="mt-1 block w-full rounded-md border border-border-default px-2 py-1.5 font-mono text-xs" />
          </div>
          <div>
            <label htmlFor="actor" className="block text-xs font-medium text-text-muted">Actor</label>
            <select id="actor" name="actor" defaultValue={actorId != null ? String(actorId) : ''} className="mt-1 block w-full rounded-md border border-border-default px-2 py-1.5 text-sm">
              <option value="">any</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="since" className="block text-xs font-medium text-text-muted">Since (YYYY-MM-DD)</label>
            <input id="since" name="since" type="date" defaultValue={since ?? ''} className="mt-1 block w-full rounded-md border border-border-default px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label htmlFor="until" className="block text-xs font-medium text-text-muted">Until (inclusive)</label>
            <input id="until" name="until" type="date" defaultValue={until ?? ''} className="mt-1 block w-full rounded-md border border-border-default px-2 py-1.5 text-sm" />
          </div>
          {/*
            `?q=` rides a HIDDEN input because a GET form submits its own fields
            and nothing else: without it, pressing Apply would silently empty the
            table's find box, which is a param this form does not own. Clear
            drops it along with everything else — it is the reset.
          */}
          <input type="hidden" name="q" value={query ?? ''} />
          <div className="flex items-end gap-2">
            <Button variant="primary" size="sm" type="submit">
              Apply
            </Button>
            <Link href="/inventory/events" className="rounded-md border border-border-default bg-surface-card px-4 py-1.5 text-sm font-medium text-text-muted hover:bg-surface-hover">
              Clear
            </Link>
          </div>
        </form>

        <section className="space-y-3">
          <header className="flex items-center justify-between">
            <div className="text-sm text-text-muted">
              <span className="font-semibold">{total.toLocaleString()}</span> event{total === 1 ? '' : 's'} match
              {total > PAGE_SIZE ? <span className="text-text-soft"> · page {page + 1} of {totalPages}</span> : null}
            </div>
            {total > PAGE_SIZE ? (
              <nav className="flex items-center gap-2 text-sm">
                {page > 0 ? (
                  <Link href={buildPageHref(baseQuery, page - 1)} className="rounded border border-border-default px-3 py-1 hover:bg-surface-hover">← prev</Link>
                ) : null}
                {page + 1 < totalPages ? (
                  <Link href={buildPageHref(baseQuery, page + 1)} className="rounded border border-border-default px-3 py-1 hover:bg-surface-hover">next →</Link>
                ) : null}
              </nav>
            ) : null}
          </header>
          <EventsExplorerTable
            events={events}
            emptyMessage={isFiltering ? 'No events match the current filters.' : 'No events yet.'}
          />
        </section>
      </div>
    </div>
  );
}
