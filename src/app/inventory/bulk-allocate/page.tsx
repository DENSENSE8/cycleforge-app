import { requirePermission } from '@/lib/auth/page-guard';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { allocateOrder } from '@/lib/inventory/allocate';
import {
  toAllocationCandidateRow,
  type AllocationCandidateQueryRow,
  type AllocationCandidateRow,
} from '@/lib/inventory/allocation-candidate-row';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/pane-header';
import { AllocationCandidatesTable } from './AllocationCandidatesTable';

export const dynamic = 'force-dynamic';

/** /inventory/bulk-allocate */

const PAGE_SIZE = 100;

async function loadCandidates(
  page: number,
  orgId: OrgId,
): Promise<{ rows: AllocationCandidateRow[]; total: number }> {
  // Orders that meet ALL of:
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

    const rows = await tenantQuery<AllocationCandidateQueryRow>(
      orgId,
      `SELECT o.id AS order_id, o.order_id AS order_id_text,
              o.sku AS sku, o.condition,
              o.quantity AS quantity_str,
              o.order_date, o.created_at,
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
    return { rows: rows.rows.map(toAllocationCandidateRow), total };
  } catch {
    return { rows: [], total: 0 };
  }
}

/** Server action: allocate one order. Revalidates the page after. */
async function allocateOne(formData: FormData): Promise<void> {
  'use server';
  const id = Number(formData.get('orderId'));
  if (!Number.isFinite(id) || id <= 0) return;

  // The guard sits OUTSIDE the try.
  const user = await requirePermission('orders.view', { enforce: true });

  try {
    // orgId threaded → allocateOrder runs in withTenantTransaction with its own
    // explicit organization_id predicates on the order load, the candidate
    // selection and the INSERT.
    await allocateOrder({ orderId: id, actorStaffId: null }, user.organizationId);
  } catch (err) {
    console.error('[bulk-allocate] allocateOne failed:', err);
  }
  revalidatePath('/inventory/bulk-allocate');
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

  return (
    <div className="min-h-screen bg-surface-canvas">
      <PageHeader backHref="/inventory/health" title="Bulk allocate" />
      <div className="space-y-6 p-8">
        <p className="text-sm text-text-muted">
          Orders with a SKU and no open allocation. <em>Allocate</em> on a row reserves STOCKED units
          FIFO; a row short of stock says how short it is instead.
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
                  <Link href={`/inventory/bulk-allocate?page=${page - 1}`} className="rounded border border-border-default px-3 py-1 hover:bg-surface-hover">
                    ← prev
                  </Link>
                ) : null}
                {page + 1 < totalPages ? (
                  <Link href={`/inventory/bulk-allocate?page=${page + 1}`} className="rounded border border-border-default px-3 py-1 hover:bg-surface-hover">
                    next →
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </header>

          <AllocationCandidatesTable rows={rows} allocate={allocateOne} />
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
