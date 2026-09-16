'use client';

/**
 * Admin › Bulk allocate — the CLIENT ISLAND for
 * `/inventory/bulk-allocate`.
 *
 * The page stays an RSC: it guards on `admin.view`, runs the candidate query,
 * owns the `?page=` offset links, and declares the per-row server action. None
 * of that moves. This file is only the boundary the slot engine needs (hooks,
 * layout cascade, header sort), and it takes its rows as props — the SQL stays
 * on the server.
 *
 * Same shape as `../returns/RecentReturnsTable.tsx`: spread the family's feed
 * onto DataTable and nothing else.
 *
 * ## How the server action crosses the boundary
 *
 * `allocateOne` is declared in the page with `'use server'` in its body, so
 * Next compiles it to a server-action REFERENCE, and passing that reference
 * through this component's `allocate` prop is exactly what a `<form action={…}>`
 * did before — a client `<form>` was already invoking it over the same channel.
 * What crosses is the id of the action, never its code: the `orders.view`
 * `requirePermission` and the `revalidatePath('/inventory/bulk-allocate')`
 * both still run ON THE SERVER, inside the action, unchanged and un-bypassable
 * from here. This island cannot weaken either one; the worst it can do is fail
 * to call the action.
 *
 * The payload is still `FormData` with one `orderId`, because keeping the
 * action's signature identical is what makes "the gate and the revalidate are
 * untouched" a fact rather than a claim.
 */

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/tables/DataTable';
import { useAdminBulkAllocateSpreadsheet } from '@/components/inventory/bulk-allocate-grid/useAdminBulkAllocateSpreadsheet';
import { resolveAdminBulkAllocateRowActions } from '@/components/inventory/bulk-allocate-grid/admin-bulk-allocate-verbs';
import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import type { AllocationCandidateRow } from '@/lib/inventory/allocation-candidate-row';

export interface AllocationCandidatesTableProps {
  rows: readonly AllocationCandidateRow[];
  /**
   * The page's per-row server action. Gated `orders.view` and followed by
   * `revalidatePath` on the server side — see the docblock.
   */
  allocate: (formData: FormData) => Promise<void>;
}

export function AllocationCandidatesTable({ rows, allocate }: AllocationCandidatesTableProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pendingOrderId, setPendingOrderId] = useState<number | null>(null);

  /**
   * The Allocate verb's handler — the one thing the verb catalog cannot hold.
   * The action revalidates this route, so the fresh candidate list arrives on
   * the transition rather than from a client refetch.
   */
  const onAllocate = useCallback(
    (row: AllocationCandidateRow) => {
      setPendingOrderId(row.order_id);
      const payload = new FormData();
      payload.set('orderId', String(row.order_id));
      startTransition(async () => {
        try {
          await allocate(payload);
        } finally {
          setPendingOrderId(null);
        }
      });
    },
    [allocate],
  );

  const rowActions = useCallback(
    (row: AllocationCandidateRow): readonly CompoundRowAction[] =>
      resolveAdminBulkAllocateRowActions(row, {
        onAllocate,
        isPending: (candidate) => candidate.order_id === pendingOrderId,
      }),
    [onAllocate, pendingOrderId],
  );

  /**
   * The binding's `navigate` record plane, wired to the router.
   *
   * This is the retired SKU cell's `<Link>`: the reach-through is declared once
   * on the entity (`ADMIN_BULK_ALLOCATE_TABLE_BINDING.recordPlane`) and the
   * mount supplies the only thing a binding cannot hold — the router. The
   * candidate query guarantees a non-blank SKU, so a row with nothing to open
   * is a malformed row and does nothing.
   */
  const openSku = useCallback(
    (row: AllocationCandidateRow) => {
      const sku = row.sku?.trim();
      if (!sku) return;
      router.push(`/inventory/health/sku/${encodeURIComponent(sku)}`);
    },
    [router],
  );

  const sheet = useAdminBulkAllocateSpreadsheet({ rows, onOpenRow: openSku, rowActions });

  return (
    <div className="flex h-[60vh] min-h-0 min-w-0 flex-col">
      <DataTable
        {...sheet}
        totalCount={rows.length}
        searchEmptyMessage="No candidates on this page match that filter."
      />
    </div>
  );
}
