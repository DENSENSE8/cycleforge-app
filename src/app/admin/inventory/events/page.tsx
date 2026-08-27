import { requirePermission } from '@/lib/auth/page-guard';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/pane-header';
import { Button } from '@/design-system/primitives';
import { DataTable, type DataTableColumn } from '@/design-system/components/DataTable';

export const dynamic = 'force-dynamic';

/**
 * /admin/inventory/events — Global inventory_events explorer.
 *
 * Server-rendered table with URL-query filters. All filters narrow the
 * same base query so they compose: event_type+station+date range works
 * the same as just date range. Pagination is offset-based via ?page=N
 * (zero-indexed). Page size is fixed at 100 to keep the page small.
 *
 * Query params:
 *   event_type   one of the canonical event_type values
 *   station      RECEIVING | TECH | PACK | SHIP | MOBILE | SYSTEM
 *   sku          exact match
 *   unit         serial_units.id (numeric)
 *   since        ISO date (YYYY-MM-DD) — inclusive lower bound
 *   until        ISO date — exclusive upper bound (so "today" = today+1)
 *   actor        staff.id (numeric)
 *   page         zero-indexed page number
 *
 * Filters round-trip via a single <form> using GET so deep-link sharing
 * just works.
 *
 * Tenant scoping: every read goes through `tenantQuery(orgId, …)` with an
 * explicit `organization_id` predicate, and `orgId` comes from the auth ctx
 * (`requirePermission` → `user.organizationId`) — never from a query param.
 * None of these filters is org-bearing (event type, station, SKU, unit id and
 * staff id all collide across tenants), so a bare owner-pool read returned
 * every tenant's event log to any authenticated admin — RLS does not bite on
 * the owner pool. That was live here for both loaders until 2026-08-21.
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
  occurred_at: Date;
  event_type: string;
  station: string | null;
  sku: string | null;
  serial_unit_id: number | null;
  prev_status: string | null;
  next_status: string | null;
  actor_staff_id: number | null;
  actor_name: string | null;
  receiving_line_id: number | null;
  bin_id: number | null;
  bin_name: string | null;
  notes: string | null;
  client_event_id: string | null;
}

interface StaffOption { id: number; name: string }

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
  page: number;
  orgId: OrgId;
}): Promise<{ rows: EventRow[]; total: number }> {
  // The org predicate is always $1 — it is not optional, so it seeds both the
  // filter list and the param list before any user-supplied filter is appended.
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
  const whereSql = `WHERE ${filters.join(' AND ')}`;

  try {
    const countSql = `SELECT COUNT(*)::int AS n FROM inventory_events ie ${whereSql}`;
    const countParams = [...params];
    const countRes = await tenantQuery<{ n: number }>(opts.orgId, countSql, countParams);
    const total = countRes.rows[0]?.n ?? 0;

    params.push(PAGE_SIZE);
    params.push(opts.page * PAGE_SIZE);

    const rowsSql = `
      SELECT ie.id, ie.occurred_at, ie.event_type, ie.station,
             ie.sku, ie.serial_unit_id,
             ie.prev_status, ie.next_status,
             ie.actor_staff_id, s.name AS actor_name,
             ie.receiving_line_id,
             ie.bin_id, l.name AS bin_name,
             ie.notes, ie.client_event_id
        FROM inventory_events ie
        LEFT JOIN staff s ON s.id = ie.actor_staff_id AND s.organization_id = $1
        LEFT JOIN locations l ON l.id = ie.bin_id AND l.organization_id = $1
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
  return qs ? `/admin/inventory/events?${qs}` : '/admin/inventory/events';
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
  const page = Math.max(0, parseInteger(params.page) ?? 0);

  const [staff, { rows, total }] = await Promise.all([
    loadStaff(orgId),
    loadEvents({ eventType, station, sku, unitId, actorId, since, until, page, orgId }),
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
  };
  const isFiltering = Boolean(
    eventType || station || sku || unitId != null || actorId != null || since || until,
  );

  const eventColumns: DataTableColumn<EventRow>[] = [
    {
      key: 'when',
      header: 'When',
      type: 'date',
      cell: (e) => (
        <span className="whitespace-nowrap text-xs text-text-soft">
          {new Date(e.occurred_at).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'event',
      header: 'Event',
      type: 'tag',
      cell: (e) => <span className="font-mono text-xs">{e.event_type}</span>,
    },
    {
      key: 'station',
      header: 'Station',
      type: 'text',
      cell: (e) => <span className="text-xs text-text-muted">{e.station ?? '—'}</span>,
    },
    {
      key: 'unit',
      header: 'Unit',
      type: 'id',
      cell: (e) =>
        e.serial_unit_id ? (
          <Link
            href={`/admin/inventory/units/${e.serial_unit_id}`}
            className="font-mono text-xs text-blue-600 hover:underline"
          >
            #{e.serial_unit_id}
          </Link>
        ) : (
          '—'
        ),
    },
    {
      key: 'sku',
      header: 'SKU',
      type: 'id',
      cell: (e) =>
        e.sku ? (
          <Link
            href={`/admin/inventory/sku/${encodeURIComponent(e.sku)}`}
            className="font-mono text-xs text-blue-600 hover:underline"
          >
            {e.sku}
          </Link>
        ) : (
          '—'
        ),
    },
    {
      key: 'status',
      header: 'Status',
      type: 'tag',
      cell: (e) => (
        <span className="text-xs text-text-muted">
          {e.prev_status && e.next_status
            ? `${e.prev_status} → ${e.next_status}`
            : (e.next_status ?? '—')}
        </span>
      ),
    },
    {
      key: 'bin',
      header: 'Bin',
      type: 'text',
      cell: (e) => (
        <span className="text-xs text-text-muted">
          {e.bin_name ?? (e.bin_id ? `#${e.bin_id}` : '—')}
        </span>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      type: 'text',
      cell: (e) => (
        <span className="text-xs text-text-muted">
          {e.actor_name ?? (e.actor_staff_id ? `#${e.actor_staff_id}` : 'system')}
        </span>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-surface-canvas">
      <PageHeader backHref="/admin/inventory" title="Inventory events" />
      <div className="space-y-6 p-8">
        <p className="text-sm text-text-muted">
          Global event log. Filters compose; the URL is shareable.
        </p>

        <form action="/admin/inventory/events" method="get" className="grid grid-cols-2 gap-3 rounded-lg border border-border-soft bg-surface-card p-4 shadow-sm md:grid-cols-4">
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
          <div className="flex items-end gap-2">
            <Button variant="primary" size="sm" type="submit">
              Apply
            </Button>
            <Link href="/admin/inventory/events" className="rounded-md border border-border-default bg-surface-card px-4 py-1.5 text-sm font-medium text-text-muted hover:bg-surface-hover">
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
          <DataTable
            columns={eventColumns}
            rows={rows}
            rowKey={(e) => e.id}
            isSearching={isFiltering}
            searchEmptyMessage="No events match the current filters."
            emptyMessage="No events yet."
          />
        </section>
      </div>
    </div>
  );
}
