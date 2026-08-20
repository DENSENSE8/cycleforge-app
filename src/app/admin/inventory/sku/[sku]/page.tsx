import { requirePermission } from '@/lib/auth/page-guard';
import { queryRaw, queryOne } from '@/lib/neon-client';
import { unitStatusBadgeClass } from '@/lib/unit-status';
import Link from 'next/link';
import { DataTable, type DataTableColumn } from '@/design-system/components/DataTable';
import { Panel } from '@/design-system/primitives';


export const dynamic = 'force-dynamic';

/**
 * /admin/inventory/sku/[sku] — Per-SKU operations view.
 *
 * Read-only. Sections:
 *   - sku_catalog metadata (title, category, GTIN, UPC, EAN, active flag)
 *   - Current stock (sku_stock.stock + .boxed_stock)
 *   - Bin distribution (bin_contents rows joined to locations)
 *   - Serial units for this SKU grouped by current_status
 *   - Open order_unit_allocations
 *   - sku_stock_ledger (last 100 rows)
 *   - inventory_events (last 50)
 *
 * Each query is independent. Missing sections (e.g. SKU has no
 * sku_catalog row) degrade gracefully rather than 404-ing the page.
 */

interface CatalogRow {
  id: number;
  sku: string;
  product_title: string;
  category: string | null;
  gtin: string | null;
  upc: string | null;
  ean: string | null;
  is_active: boolean;
}

interface StockRow {
  sku: string;
  stock: number;
  boxed_stock: number;
  product_title: string | null;
  updated_at: Date | null;
}

interface BinRow {
  location_id: number;
  bin_name: string | null;
  bin_barcode: string | null;
  qty: number;
  min_qty: number | null;
  max_qty: number | null;
  last_counted: Date | null;
}

interface UnitStatusCountRow {
  current_status: string;
  count: number;
}

interface RecentUnitRow {
  id: number;
  serial_number: string;
  current_status: string;
  current_location: string | null;
  condition_grade: string | null;
  updated_at: Date;
}

interface AllocationRow {
  id: number;
  order_id: number;
  serial_unit_id: number;
  state: string;
  allocated_at: Date;
  allocated_by_name: string | null;
}

interface LedgerRow {
  id: number;
  created_at: Date;
  delta: number;
  reason: string;
  dimension: string;
  staff_name: string | null;
  ref_serial_unit_id: number | null;
  ref_order_id: number | null;
  ref_receiving_line_id: number | null;
  notes: string | null;
}

interface EventRow {
  id: number;
  occurred_at: Date;
  event_type: string;
  station: string | null;
  serial_unit_id: number | null;
  prev_status: string | null;
  next_status: string | null;
  actor_name: string | null;
}

async function loadCatalog(sku: string): Promise<CatalogRow | null> {
  return queryOne<CatalogRow>`
    SELECT id, sku, product_title, category, gtin, upc, ean, is_active
      FROM sku_catalog WHERE sku = ${sku} LIMIT 1`;
}

async function loadStock(sku: string): Promise<StockRow | null> {
  try {
    return await queryOne<StockRow>`
      SELECT sku, stock, boxed_stock, product_title, updated_at
        FROM sku_stock WHERE sku = ${sku} LIMIT 1`;
  } catch {
    return null;
  }
}

async function loadBins(sku: string): Promise<BinRow[]> {
  try {
    return await queryRaw<BinRow>(
      `SELECT bc.location_id, l.name AS bin_name, l.barcode AS bin_barcode,
              bc.qty, bc.min_qty, bc.max_qty, bc.last_counted
         FROM bin_contents bc
         LEFT JOIN locations l ON l.id = bc.location_id
        WHERE bc.sku = $1
        ORDER BY bc.qty DESC, l.name ASC`,
      [sku],
    );
  } catch {
    return [];
  }
}

async function loadUnitStatusCounts(sku: string): Promise<UnitStatusCountRow[]> {
  try {
    return await queryRaw<UnitStatusCountRow>(
      `SELECT current_status::text AS current_status, COUNT(*)::int AS count
         FROM serial_units
        WHERE sku = $1
        GROUP BY current_status
        ORDER BY count DESC`,
      [sku],
    );
  } catch {
    return [];
  }
}

async function loadRecentUnits(sku: string): Promise<RecentUnitRow[]> {
  try {
    return await queryRaw<RecentUnitRow>(
      `SELECT id, serial_number, current_status::text AS current_status,
              current_location, condition_grade::text AS condition_grade,
              updated_at
         FROM serial_units
        WHERE sku = $1
        ORDER BY updated_at DESC, id DESC
        LIMIT 25`,
      [sku],
    );
  } catch {
    return [];
  }
}

async function loadAllocations(sku: string): Promise<AllocationRow[]> {
  try {
    return await queryRaw<AllocationRow>(
      `SELECT a.id, a.order_id, a.serial_unit_id, a.state::text AS state,
              a.allocated_at, s.name AS allocated_by_name
         FROM order_unit_allocations a
         JOIN serial_units su ON su.id = a.serial_unit_id
         LEFT JOIN staff s ON s.id = a.allocated_by_staff_id
        WHERE su.sku = $1
          AND a.state <> 'RELEASED'
        ORDER BY a.allocated_at DESC, a.id DESC
        LIMIT 50`,
      [sku],
    );
  } catch {
    return [];
  }
}

async function loadLedger(sku: string): Promise<LedgerRow[]> {
  try {
    return await queryRaw<LedgerRow>(
      `SELECT l.id, l.created_at, l.delta, l.reason, l.dimension,
              s.name AS staff_name,
              l.ref_serial_unit_id, l.ref_order_id, l.ref_receiving_line_id,
              l.notes
         FROM sku_stock_ledger l
         LEFT JOIN staff s ON s.id = l.staff_id
        WHERE l.sku = $1
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT 100`,
      [sku],
    );
  } catch {
    return [];
  }
}

async function loadEvents(sku: string): Promise<EventRow[]> {
  try {
    return await queryRaw<EventRow>(
      `SELECT ie.id, ie.occurred_at, ie.event_type, ie.station,
              ie.serial_unit_id, ie.prev_status, ie.next_status,
              s.name AS actor_name
         FROM inventory_events ie
         LEFT JOIN staff s ON s.id = ie.actor_staff_id
        WHERE ie.sku = $1
        ORDER BY ie.occurred_at DESC, ie.id DESC
        LIMIT 50`,
      [sku],
    );
  } catch {
    return [];
  }
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-text-faint">—</span>;
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${unitStatusBadgeClass(status)}`}>
      {status}
    </span>
  );
}

export default async function SkuDetailPage({ params }: { params: Promise<{ sku: string }> }) {
  await requirePermission('admin.view', { enforce: true });

  const { sku } = await params;
  const cleaned = decodeURIComponent(sku || '').trim();
  if (!cleaned) {
    return (
      <div className="min-h-screen bg-surface-canvas p-8">
        <div className="mx-auto max-w-3xl space-y-2">
          <Link href="/admin/inventory" className="text-sm text-blue-600 hover:underline">
            ← back
          </Link>
          <h1 className="text-2xl font-semibold text-text-default">SKU required</h1>
        </div>
      </div>
    );
  }

  const [catalog, stock, bins, statusCounts, recentUnits, allocations, ledger, events] = await Promise.all([
    loadCatalog(cleaned),
    loadStock(cleaned),
    loadBins(cleaned),
    loadUnitStatusCounts(cleaned),
    loadRecentUnits(cleaned),
    loadAllocations(cleaned),
    loadLedger(cleaned),
    loadEvents(cleaned),
  ]);

  const totalUnits = statusCounts.reduce((sum, r) => sum + Number(r.count || 0), 0);

  const binColumns: DataTableColumn<BinRow>[] = [
    {
      key: 'bin',
      header: 'Bin',
      type: 'id',
      cell: (b) => (
        <span className="font-mono text-xs">
          {b.bin_name ?? b.bin_barcode ?? `#${b.location_id}`}
        </span>
      ),
    },
    {
      key: 'qty',
      header: 'Qty',
      type: 'number',
      cell: (b) => <span className="font-semibold">{b.qty}</span>,
    },
    {
      key: 'min',
      header: 'Min',
      type: 'number',
      cell: (b) => <span className="text-text-soft">{b.min_qty ?? '—'}</span>,
    },
    {
      key: 'max',
      header: 'Max',
      type: 'number',
      cell: (b) => <span className="text-text-soft">{b.max_qty ?? '—'}</span>,
    },
    {
      key: 'last_counted',
      header: 'Last counted',
      type: 'date',
      cell: (b) => (
        <span className="text-xs text-text-soft">
          {b.last_counted ? new Date(b.last_counted).toLocaleString() : '—'}
        </span>
      ),
    },
  ];

  const unitColumns: DataTableColumn<RecentUnitRow>[] = [
    {
      key: 'serial',
      header: 'Serial',
      type: 'id',
      cell: (u) => (
        <Link
          href={`/admin/inventory/units/${u.id}`}
          className="font-mono text-xs text-blue-600 hover:underline"
        >
          {u.serial_number}
        </Link>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      type: 'tag',
      cell: (u) => <StatusBadge status={u.current_status} />,
    },
    {
      key: 'grade',
      header: 'Grade',
      type: 'tag',
      cell: (u) => <span className="text-xs text-text-muted">{u.condition_grade ?? '—'}</span>,
    },
    {
      key: 'location',
      header: 'Location',
      type: 'location',
      cell: (u) => <span className="text-xs text-text-muted">{u.current_location ?? '—'}</span>,
    },
    {
      key: 'updated',
      header: 'Updated',
      type: 'date',
      cell: (u) => (
        <span className="text-xs text-text-soft">{new Date(u.updated_at).toLocaleString()}</span>
      ),
    },
  ];

  const allocationColumns: DataTableColumn<AllocationRow>[] = [
    {
      key: 'order',
      header: 'Order',
      type: 'id',
      cell: (a) => <span className="font-mono text-xs">#{a.order_id}</span>,
    },
    {
      key: 'unit',
      header: 'Unit',
      type: 'id',
      cell: (a) => (
        <Link
          href={`/admin/inventory/units/${a.serial_unit_id}`}
          className="font-mono text-xs text-blue-600 hover:underline"
        >
          #{a.serial_unit_id}
        </Link>
      ),
    },
    {
      key: 'state',
      header: 'State',
      type: 'tag',
      cell: (a) => <StatusBadge status={a.state} />,
    },
    {
      key: 'allocated',
      header: 'Allocated',
      type: 'date',
      cell: (a) => (
        <span className="text-xs text-text-soft">{new Date(a.allocated_at).toLocaleString()}</span>
      ),
    },
    {
      key: 'by',
      header: 'By',
      type: 'text',
      cell: (a) => (
        <span className="text-xs text-text-muted">{a.allocated_by_name ?? 'system'}</span>
      ),
    },
  ];

  const ledgerColumns: DataTableColumn<LedgerRow>[] = [
    {
      key: 'when',
      header: 'When',
      type: 'date',
      cell: (l) => (
        <span className="text-xs text-text-soft">{new Date(l.created_at).toLocaleString()}</span>
      ),
    },
    {
      key: 'delta',
      header: 'Δ',
      type: 'number',
      cell: (l) => (
        <span
          className={`font-semibold ${
            l.delta > 0 ? 'text-green-700' : l.delta < 0 ? 'text-red-700' : 'text-text-soft'
          }`}
        >
          {l.delta > 0 ? '+' : ''}
          {l.delta}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      type: 'tag',
      cell: (l) => <span className="font-mono text-xs">{l.reason}</span>,
    },
    {
      key: 'dim',
      header: 'Dim',
      type: 'tag',
      cell: (l) => <span className="text-xs text-text-soft">{l.dimension}</span>,
    },
    {
      key: 'refs',
      header: 'Refs',
      type: 'text',
      cell: (l) => (
        <span className="text-xs text-text-muted">
          {[
            l.ref_order_id ? `ord#${l.ref_order_id}` : null,
            l.ref_receiving_line_id ? `rl#${l.ref_receiving_line_id}` : null,
            l.ref_serial_unit_id ? `su#${l.ref_serial_unit_id}` : null,
          ]
            .filter(Boolean)
            .join(' · ') || '—'}
        </span>
      ),
    },
    {
      key: 'by',
      header: 'By',
      type: 'text',
      cell: (l) => <span className="text-xs text-text-muted">{l.staff_name ?? 'system'}</span>,
    },
  ];

  const eventColumns: DataTableColumn<EventRow>[] = [
    {
      key: 'when',
      header: 'When',
      type: 'date',
      cell: (e) => (
        <span className="text-xs text-text-soft">{new Date(e.occurred_at).toLocaleString()}</span>
      ),
    },
    {
      key: 'event',
      header: 'Event',
      type: 'tag',
      cell: (e) => <span className="font-mono text-xs">{e.event_type}</span>,
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
      key: 'status',
      header: 'Status',
      type: 'tag',
      cell: (e) =>
        e.prev_status && e.next_status ? (
          <>
            <StatusBadge status={e.prev_status} /> → <StatusBadge status={e.next_status} />
          </>
        ) : (
          (e.next_status ?? '—')
        ),
    },
    {
      key: 'by',
      header: 'By',
      type: 'text',
      cell: (e) => <span className="text-xs text-text-muted">{e.actor_name ?? 'system'}</span>,
    },
  ];

  return (
    <div className="min-h-screen bg-surface-canvas p-8">
      <div className="space-y-8">
        <header className="space-y-2">
          <Link href="/admin/inventory" className="text-sm text-blue-600 hover:underline">
            ← back to dashboard
          </Link>
          <div className="flex items-baseline gap-4">
            <h1 className="font-mono text-2xl font-semibold text-text-default">{cleaned}</h1>
            {catalog?.is_active === false ? (
              <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">inactive</span>
            ) : null}
          </div>
          {catalog ? (
            <p className="text-sm text-text-muted">{catalog.product_title}</p>
          ) : (
            <p className="text-sm text-amber-700">
              No sku_catalog row for this SKU. Stock and event data still shown below.
            </p>
          )}
        </header>

        {/* Catalog identifiers */}
        {catalog ? (
          <Panel radius="lg" padding="none">
            <header className="border-b border-border-hairline px-6 py-4">
              <h2 className="text-lg font-medium text-text-default">Catalog</h2>
            </header>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-6 py-4 text-sm md:grid-cols-4">
              <Field label="Category">{catalog.category ?? '—'}</Field>
              <Field label="GTIN">{catalog.gtin ?? '—'}</Field>
              <Field label="UPC">{catalog.upc ?? '—'}</Field>
              <Field label="EAN">{catalog.ean ?? '—'}</Field>
            </dl>
          </Panel>
        ) : null}

        {/* Stock summary */}
        <Panel radius="lg" padding="none">
          <header className="flex items-center justify-between border-b border-border-hairline px-6 py-4">
            <h2 className="text-lg font-medium text-text-default">Current stock</h2>
            {stock?.updated_at ? (
              <span className="text-xs text-text-soft">
                updated {new Date(stock.updated_at).toLocaleString()}
              </span>
            ) : null}
          </header>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-6 py-4 text-sm md:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-text-soft">Warehouse</dt>
              <dd className="mt-1 text-2xl font-semibold text-green-700">{stock?.stock ?? 0}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-text-soft">Boxed</dt>
              <dd className="mt-1 text-2xl font-semibold text-teal-700">{stock?.boxed_stock ?? 0}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-text-soft">Serial units (any state)</dt>
              <dd className="mt-1 text-2xl font-semibold text-text-default">{totalUnits}</dd>
            </div>
          </dl>
          {statusCounts.length > 0 ? (
            <div className="border-t border-border-hairline px-6 py-3">
              <p className="mb-2 text-xs uppercase tracking-wide text-text-soft">Units by status</p>
              <div className="flex flex-wrap gap-2">
                {statusCounts.map((s) => (
                  <span key={s.current_status} className="inline-flex items-center gap-2 rounded-md bg-surface-canvas px-3 py-1 text-xs">
                    <StatusBadge status={s.current_status} />
                    <span className="font-semibold text-text-default">{s.count}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </Panel>

        {/* Bin distribution */}
        <section className="space-y-3">
          <header className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-text-default">Bin distribution</h2>
            <span className="text-xs text-text-soft">{bins.length} bins</span>
          </header>
          <DataTable
            columns={binColumns}
            rows={bins}
            rowKey={(b) => b.location_id}
            emptyMessage="No bin assignments for this SKU."
          />
        </section>

        {/* Recent serial units */}
        {recentUnits.length > 0 ? (
          <section className="space-y-3">
            <header className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-text-default">Recent serial units</h2>
              <span className="text-xs text-text-soft">last 25 of {totalUnits}</span>
            </header>
            <DataTable columns={unitColumns} rows={recentUnits} rowKey={(u) => u.id} />
          </section>
        ) : null}

        {/* Open allocations */}
        {allocations.length > 0 ? (
          <section className="space-y-3">
            <header>
              <h2 className="text-lg font-medium text-text-default">Open allocations</h2>
            </header>
            <DataTable columns={allocationColumns} rows={allocations} rowKey={(a) => a.id} />
          </section>
        ) : null}

        {/* Ledger */}
        <section className="space-y-3">
          <header className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-text-default">Stock ledger</h2>
            <span className="text-xs text-text-soft">last 100</span>
          </header>
          <DataTable
            columns={ledgerColumns}
            rows={ledger}
            rowKey={(l) => l.id}
            emptyMessage="No ledger entries for this SKU yet."
          />
        </section>

        {/* Events */}
        <section className="space-y-3">
          <header className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-text-default">Recent inventory events</h2>
            <span className="text-xs text-text-soft">last 50</span>
          </header>
          <DataTable
            columns={eventColumns}
            rows={events}
            rowKey={(e) => e.id}
            emptyMessage="No events recorded for this SKU yet."
          />
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-text-soft">{label}</dt>
      <dd className="mt-0.5 text-sm text-text-default">{children}</dd>
    </div>
  );
}
