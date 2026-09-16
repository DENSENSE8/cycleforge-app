import { requirePermission } from '@/lib/auth/page-guard';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { unitStatusBadgeClass } from '@/lib/unit-status';
import Link from 'next/link';
import {
  SkuAllocationsTable,
  SkuBinsTable,
  SkuEventsTable,
  SkuLedgerTable,
  SkuRecentUnitsTable,
} from './SkuDetailTables';
import { Panel } from '@/design-system/primitives';


export const dynamic = 'force-dynamic';

/**
 * /inventory/health/sku/[sku] — Per-SKU operations view.
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
 * EVERY one of those five row sections is on the slot-table ENGINE, mounted
 * through `./SkuDetailTables` (the client islands this server component
 * renders — the loaders below stay server-side). Three reuse a registered
 * family rather than a hand column list: recent serial units mount
 * `inventory-units`, recent inventory events mount `inventory-events`, and
 * open allocations mount `unit-allocations` on this desk's own layout
 * document. Bins and the stock ledger are families of their own (`sku-bins`,
 * `sku-ledger`) because a (sku, bin) pair and a signed stock movement are
 * entities nothing else in the product lists. The second table engine this
 * page used to import is gone from it.
 *
 * Each query is independent. Missing sections (e.g. SKU has no
 * sku_catalog row) degrade gracefully rather than 404-ing the page.
 *
 * Tenant scoping: every read here goes through `tenantQuery(orgId, …)` with an
 * explicit `organization_id` predicate, and `orgId` comes from the auth ctx
 * (`requirePermission` → `user.organizationId`) — never from the route param.
 * SKU strings collide across orgs, so a bare owner-pool read keyed on `sku`
 * alone returns another tenant's rows (RLS does not bite on the owner pool).
 * That was live here for all eight loaders until 2026-08-21.
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
  /**
   * `NULL` for a machine write. Selected so the ledger's actor can paint as a
   * PERSON face: the retired cell printed `staff_name ?? 'system'`, which names
   * a machine as though it were a staffer, and the person cell needs the id to
   * tell an absent actor from a named one.
   */
  staff_id: number | null;
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

async function loadCatalog(sku: string, orgId: OrgId): Promise<CatalogRow | null> {
  const r = await tenantQuery<CatalogRow>(
    orgId,
    `SELECT id, sku, product_title, category, gtin, upc, ean, is_active
       FROM sku_catalog WHERE sku = $1 AND organization_id = $2 LIMIT 1`,
    [sku, orgId],
  );
  return r.rows[0] ?? null;
}

async function loadStock(sku: string, orgId: OrgId): Promise<StockRow | null> {
  try {
    const r = await tenantQuery<StockRow>(
      orgId,
      `SELECT sku, stock, boxed_stock, product_title, updated_at
         FROM sku_stock WHERE sku = $1 AND organization_id = $2 LIMIT 1`,
      [sku, orgId],
    );
    return r.rows[0] ?? null;
  } catch {
    return null;
  }
}

async function loadBins(sku: string, orgId: OrgId): Promise<BinRow[]> {
  try {
    const r = await tenantQuery<BinRow>(
      orgId,
      `SELECT bc.location_id, l.name AS bin_name, l.barcode AS bin_barcode,
              bc.qty, bc.min_qty, bc.max_qty, bc.last_counted
         FROM bin_contents bc
         LEFT JOIN locations l ON l.id = bc.location_id AND l.organization_id = $2
        WHERE bc.sku = $1 AND bc.organization_id = $2
        ORDER BY bc.qty DESC, l.name ASC`,
      [sku, orgId],
    );
    return r.rows;
  } catch {
    return [];
  }
}

async function loadUnitStatusCounts(sku: string, orgId: OrgId): Promise<UnitStatusCountRow[]> {
  try {
    const r = await tenantQuery<UnitStatusCountRow>(
      orgId,
      `SELECT current_status::text AS current_status, COUNT(*)::int AS count
         FROM serial_units
        WHERE sku = $1 AND organization_id = $2
        GROUP BY current_status
        ORDER BY count DESC`,
      [sku, orgId],
    );
    return r.rows;
  } catch {
    return [];
  }
}

async function loadRecentUnits(sku: string, orgId: OrgId): Promise<RecentUnitRow[]> {
  try {
    const r = await tenantQuery<RecentUnitRow>(
      orgId,
      `SELECT id, serial_number, current_status::text AS current_status,
              current_location, condition_grade::text AS condition_grade,
              updated_at
         FROM serial_units
        WHERE sku = $1 AND organization_id = $2
        ORDER BY updated_at DESC, id DESC
        LIMIT 25`,
      [sku, orgId],
    );
    return r.rows;
  } catch {
    return [];
  }
}

async function loadAllocations(sku: string, orgId: OrgId): Promise<AllocationRow[]> {
  try {
    const r = await tenantQuery<AllocationRow>(
      orgId,
      `SELECT a.id, a.order_id, a.serial_unit_id, a.state::text AS state,
              a.allocated_at, s.name AS allocated_by_name
         FROM order_unit_allocations a
         JOIN serial_units su ON su.id = a.serial_unit_id AND su.organization_id = $2
         LEFT JOIN staff s ON s.id = a.allocated_by_staff_id AND s.organization_id = $2
        WHERE su.sku = $1
          AND a.organization_id = $2
          AND a.state <> 'RELEASED'
        ORDER BY a.allocated_at DESC, a.id DESC
        LIMIT 50`,
      [sku, orgId],
    );
    return r.rows;
  } catch {
    return [];
  }
}

async function loadLedger(sku: string, orgId: OrgId): Promise<LedgerRow[]> {
  try {
    const r = await tenantQuery<LedgerRow>(
      orgId,
      `SELECT l.id, l.created_at, l.delta, l.reason, l.dimension,
              l.staff_id, s.name AS staff_name,
              l.ref_serial_unit_id, l.ref_order_id, l.ref_receiving_line_id,
              l.notes
         FROM sku_stock_ledger l
         LEFT JOIN staff s ON s.id = l.staff_id AND s.organization_id = $2
        WHERE l.sku = $1 AND l.organization_id = $2
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT 100`,
      [sku, orgId],
    );
    return r.rows;
  } catch {
    return [];
  }
}

async function loadEvents(sku: string, orgId: OrgId): Promise<EventRow[]> {
  try {
    const r = await tenantQuery<EventRow>(
      orgId,
      `SELECT ie.id, ie.occurred_at, ie.event_type, ie.station,
              ie.serial_unit_id, ie.prev_status, ie.next_status,
              s.name AS actor_name
         FROM inventory_events ie
         LEFT JOIN staff s ON s.id = ie.actor_staff_id AND s.organization_id = $2
        WHERE ie.sku = $1 AND ie.organization_id = $2
        ORDER BY ie.occurred_at DESC, ie.id DESC
        LIMIT 50`,
      [sku, orgId],
    );
    return r.rows;
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
  const user = await requirePermission('admin.view', { enforce: true });
  const orgId = user.organizationId;

  const { sku } = await params;
  const cleaned = decodeURIComponent(sku || '').trim();
  if (!cleaned) {
    return (
      <div className="min-h-screen bg-surface-canvas p-8">
        <div className="mx-auto max-w-3xl space-y-2">
          <Link href="/inventory/health" className="text-sm text-blue-600 hover:underline">
            ← back
          </Link>
          <h1 className="text-2xl font-semibold text-text-default">SKU required</h1>
        </div>
      </div>
    );
  }

  const [catalog, stock, bins, statusCounts, recentUnits, allocations, ledger, events] = await Promise.all([
    loadCatalog(cleaned, orgId),
    loadStock(cleaned, orgId),
    loadBins(cleaned, orgId),
    loadUnitStatusCounts(cleaned, orgId),
    loadRecentUnits(cleaned, orgId),
    loadAllocations(cleaned, orgId),
    loadLedger(cleaned, orgId),
    loadEvents(cleaned, orgId),
  ]);

  const totalUnits = statusCounts.reduce((sum, r) => sum + Number(r.count || 0), 0);

  return (
    <div className="min-h-screen bg-surface-canvas p-8">
      <div className="space-y-8">
        <header className="space-y-2">
          <Link href="/inventory/health" className="text-sm text-blue-600 hover:underline">
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
          <SkuBinsTable
            bins={bins}
            sku={cleaned}
            productTitle={catalog?.product_title ?? null}
          />
        </section>

        {/* Recent serial units */}
        {recentUnits.length > 0 ? (
          <section className="space-y-3">
            <header className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-text-default">Recent serial units</h2>
              <span className="text-xs text-text-soft">last 25 of {totalUnits}</span>
            </header>
            <SkuRecentUnitsTable
              units={recentUnits}
              sku={cleaned}
              productTitle={catalog?.product_title ?? null}
            />
          </section>
        ) : null}

        {/* Open allocations — no `length > 0` wrapper: the feed's empty state
            says "nothing is holding this SKU", which a vanished panel cannot. */}
        <section className="space-y-3">
          <header className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-text-default">Open allocations</h2>
            <span className="text-xs text-text-soft">{allocations.length} open</span>
          </header>
          <SkuAllocationsTable allocations={allocations} />
        </section>

        {/* Ledger */}
        <section className="space-y-3">
          <header className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-text-default">Stock ledger</h2>
            <span className="text-xs text-text-soft">last 100</span>
          </header>
          <SkuLedgerTable ledger={ledger} />
        </section>

        {/* Events */}
        <section className="space-y-3">
          <header className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-text-default">Recent inventory events</h2>
            <span className="text-xs text-text-soft">last 50</span>
          </header>
          <SkuEventsTable
            events={events}
            sku={cleaned}
            productTitle={catalog?.product_title ?? null}
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
