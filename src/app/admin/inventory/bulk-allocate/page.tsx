import { requirePermission } from '@/lib/auth/page-guard';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { allocateOrder } from '@/lib/inventory/allocate';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/pane-header';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button } from '@/design-system/primitives';
import { AdminTable, type AdminTableColumn } from '@/design-system/components/AdminTable';

export const dynamic = 'force-dynamic';

/**
 * /admin/inventory/bulk-allocate
 *
 * Operations tool for Phase 4 rollout. Lists orders that have a SKU but
 * no open order_unit_allocations row, alongside how many STOCKED
 * serial_units exist for the same SKU. A per-row server action calls
 * allocateOrder() (the same helper /api/orders/[id]/allocate uses) and
 * revalidates the page so the result lands in the same render cycle.
 *
 * Permission gate: `admin.view` to RENDER, `orders.view` inside the server
 * action — the latter matching POST /api/orders/[id]/allocate, the other door
 * onto `allocateOrder`. This line claimed "orders.view (matches the API)" while
 * the action actually gated `admin.view`, which matches neither.
 *
 * Tenant scoping: the candidate list runs through `tenantQuery(orgId, …)` with
 * an explicit `organization_id` predicate on `orders`, on the open-allocation
 * NOT EXISTS, and on the STOCKED-count LATERAL, with `orgId` from the auth ctx.
 * Unscoped, this listed EVERY tenant's unallocated orders and offered an
 * Allocate button on each — the allocation itself is org-safe (`allocateOrder`
 * takes `orgId` and predicates its own order load), so a cross-tenant click
 * failed to match rather than allocating, but the order ids, SKUs, quantities
 * and conditions were already on screen. `available_stocked` was also counting
 * other tenants' STOCKED units, so the eligibility flag was wrong for one's own
 * orders too. Live until 2026-08-21.
 */

interface CandidateRow {
  order_id: number;
  order_id_text: string | null;
  sku: string;
  condition: string | null;
  quantity_str: string | null;
  available_stocked: number;
}

const PAGE_SIZE = 100;

async function loadCandidates(page: number, orgId: OrgId): Promise<{ rows: CandidateRow[]; total: number }> {
  // Orders that meet ALL of:
  //   - have a non-empty SKU
  //   - have NO open (non-RELEASED) order_unit_allocations row
  //   - status is null or NOT 'shipped' (don't re-allocate shipped orders)
  // The available_stocked column reflects current STOCKED inventory for
  // the SKU at query time — purely diagnostic, not locked.
  try {
    // The NOT EXISTS is org-scoped too: an open allocation belonging to another
    // tenant must not suppress one's own order from the candidate list.
    const totalQ = await tenantQuery<{ n: number }>(
      orgId,
      `SELECT COUNT(*)::int AS n
         FROM orders o
        WHERE o.sku IS NOT NULL AND BTRIM(o.sku) <> ''
          AND COALESCE(o.status, '') <> 'shipped'
          AND o.organization_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM order_unit_allocations oua
             WHERE oua.order_id = o.id AND oua.state <> 'RELEASED'
               AND oua.organization_id = $1
          )`,
      [orgId],
    );
    const total = totalQ.rows[0]?.n ?? 0;

    const rows = await tenantQuery<CandidateRow>(
      orgId,
      `SELECT o.id AS order_id, o.order_id AS order_id_text,
              o.sku AS sku, o.condition,
              o.quantity AS quantity_str,
              COALESCE(stocked.n, 0)::int AS available_stocked
         FROM orders o
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS n
             FROM serial_units su
            WHERE su.current_status = 'STOCKED'::serial_status_enum
              AND su.sku = o.sku
              AND su.organization_id = $1
         ) stocked ON TRUE
        WHERE o.sku IS NOT NULL AND BTRIM(o.sku) <> ''
          AND COALESCE(o.status, '') <> 'shipped'
          AND o.organization_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM order_unit_allocations oua
             WHERE oua.order_id = o.id AND oua.state <> 'RELEASED'
               AND oua.organization_id = $1
          )
        ORDER BY o.id DESC
        LIMIT $2 OFFSET $3`,
      [orgId, PAGE_SIZE, page * PAGE_SIZE],
    );
    return { rows: rows.rows, total };
  } catch {
    return { rows: [], total: 0 };
  }
}

/** Server action: allocate one order. Revalidates the page after. */
async function allocateOne(formData: FormData): Promise<void> {
  'use server';
  const id = Number(formData.get('orderId'));
  if (!Number.isFinite(id) || id <= 0) return;

  // The guard sits OUTSIDE the try. `requirePermission` signals denial by
  // THROWING a NEXT_REDIRECT error, so from inside the catch it was swallowed,
  // logged as "allocateOne failed", and the caller got a silent no-op instead
  // of /not-authorized. (The allocation itself still didn't run — the throw
  // skipped it — so this was a broken guard, not an open one.)
  //
  // `orders.view` is the permission the twin door enforces
  // (POST /api/orders/[id]/allocate); a server action is its own POST
  // entrypoint and gates on its WRITE's permission, not the page's.
  const user = await requirePermission('orders.view', { enforce: true });

  try {
    // orgId threaded → allocateOrder runs in withTenantTransaction with its own
    // explicit organization_id predicates on the order load, the candidate
    // selection and the INSERT.
    await allocateOrder({ orderId: id, actorStaffId: null }, user.organizationId);
  } catch (err) {
    console.error('[bulk-allocate] allocateOne failed:', err);
  }
  revalidatePath('/admin/inventory/bulk-allocate');
}

export default async function BulkAllocatePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requirePermission('admin.view', { enforce: true });

  const params = await searchParams;
  const page = Math.max(0, Number(params.page ?? 0) || 0);
  const { rows, total } = await loadCandidates(page, user.organizationId);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  type CandidateView = CandidateRow & { qty: number; eligible: boolean };
  const viewRows: CandidateView[] = rows.map((r) => {
    const qty = Math.max(1, Math.floor(Number(r.quantity_str ?? '1') || 1));
    return { ...r, qty, eligible: r.available_stocked >= qty };
  });

  const candidateColumns: AdminTableColumn<CandidateView>[] = [
    {
      key: 'order_id',
      header: 'Order id',
      type: 'id',
      cell: (r) => <span className="font-mono text-xs">#{r.order_id}</span>,
    },
    {
      key: 'ext_id',
      header: 'Ext id',
      type: 'id',
      cell: (r) => (
        <span className="font-mono text-xs text-text-muted">{r.order_id_text ?? '—'}</span>
      ),
    },
    {
      key: 'sku',
      header: 'SKU',
      type: 'id',
      cell: (r) => (
        <Link
          href={`/admin/inventory/sku/${encodeURIComponent(r.sku)}`}
          className="font-mono text-xs text-blue-600 hover:underline"
        >
          {r.sku}
        </Link>
      ),
    },
    {
      key: 'condition',
      header: 'Condition',
      type: 'tag',
      cell: (r) => <span className="text-xs text-text-muted">{r.condition ?? '—'}</span>,
    },
    {
      key: 'qty',
      header: 'Qty',
      type: 'number',
      cell: (r) => r.qty,
    },
    {
      key: 'available',
      header: 'Available STOCKED',
      type: 'number',
      cell: (r) => (
        <span
          className={`font-semibold ${
            r.eligible
              ? 'text-green-700'
              : r.available_stocked > 0
                ? 'text-amber-700'
                : 'text-red-700'
          }`}
        >
          {r.available_stocked}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      align: 'right',
      cell: (r) => (
        <form action={allocateOne}>
          <input type="hidden" name="orderId" value={r.order_id} />
          <HoverTooltip
            label={
              !r.eligible
                ? `Need ${r.qty} stocked, only ${r.available_stocked} available`
                : 'Allocate this order'
            }
            asChild
          >
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!r.eligible}
              className={
                !r.eligible ? 'bg-surface-sunken text-text-faint hover:bg-surface-sunken' : undefined
              }
            >
              {r.eligible ? 'Allocate' : 'Insufficient'}
            </Button>
          </HoverTooltip>
        </form>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-surface-canvas">
      <PageHeader backHref="/admin/inventory" title="Bulk allocate" />
      <div className="space-y-6 p-8">
        <p className="text-sm text-text-muted">
          Orders with a SKU and no open allocation. Click <em>Allocate</em> to reserve STOCKED units FIFO.
        </p>

        <section className="space-y-3">
          <header className="flex items-center justify-between">
            <div className="text-sm text-text-muted">
              <span className="font-semibold">{total.toLocaleString()}</span> order{total === 1 ? '' : 's'} awaiting allocation
              {total > PAGE_SIZE ? <span className="text-text-soft"> · page {page + 1} of {totalPages}</span> : null}
            </div>
            {total > PAGE_SIZE ? (
              <nav className="flex items-center gap-2 text-sm">
                {page > 0 ? (
                  <Link href={`/admin/inventory/bulk-allocate?page=${page - 1}`} className="rounded border border-border-default px-3 py-1 hover:bg-surface-hover">
                    ← prev
                  </Link>
                ) : null}
                {page + 1 < totalPages ? (
                  <Link href={`/admin/inventory/bulk-allocate?page=${page + 1}`} className="rounded border border-border-default px-3 py-1 hover:bg-surface-hover">
                    next →
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </header>

          <AdminTable
            columns={candidateColumns}
            rows={viewRows}
            rowKey={(r) => r.order_id}
            emptyMessage="Every non-shipped order with a SKU already has an open allocation. Nothing to do."
          />
        </section>

        <footer className="text-xs text-text-soft">
          Allocation runs through the same code path as
          <code className="mx-1 rounded bg-surface-sunken px-1 py-0.5">POST /api/orders/[id]/allocate</code>
          (<code className="rounded bg-surface-sunken px-1 py-0.5">src/lib/inventory/allocate.ts</code>) — FIFO by
          serial_units.id, locked via <code>FOR UPDATE SKIP LOCKED</code>, idx_oua_open_unit is the final guard
          against double-allocation.
        </footer>
      </div>
    </div>
  );
}
