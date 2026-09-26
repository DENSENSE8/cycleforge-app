'use client';

/** Admin › Bulk allocate — the CLIENT ISLAND for `/inventory/bulk-allocate`. */

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

  /** The binding's `navigate` record plane, wired to the router. */
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
