'use client';

/**
 * Import orders › Recent uploads — which file and format, when and by whom,
 * and how many rows landed / failed; a row opens its upload check. Two columns
 * so the list fits the page's one-third aside without running past its edge.
 */

import { useRouter } from 'next/navigation';
import { AdminTable, type AdminTableColumn } from '@/design-system/components/AdminTable/AdminTable';
import type { InboundImportBatchSummary } from '@/lib/inbound/import-check';
import { useInboundImportBatches } from '@/lib/inbound/po-csv-client';
import { purchaseImportCheckHref } from '@/lib/nav/route-tree';
import { formatMonthDayTimePST } from '@/utils/date';

const COLUMNS: AdminTableColumn<InboundImportBatchSummary>[] = [
  {
    key: 'file',
    header: 'File',
    type: 'text',
    cell: (batch) => (
      <span className="flex min-w-0 max-w-44 flex-col">
        <span className="truncate text-text-default" title={batch.fileName ?? undefined}>
          {batch.fileName ?? batch.label ?? `Upload ${batch.id}`}
        </span>
        <span className="truncate text-role-caption text-text-muted">
          {[batch.presetLabel, formatMonthDayTimePST(batch.createdAt), batch.createdBy?.name].filter(Boolean).join(' · ')}
        </span>
      </span>
    ),
  },
  {
    key: 'landed',
    header: 'Orders landed',
    type: 'number',
    cell: (batch) => (
      <span className="flex flex-col items-end tabular-nums">
        <span>
          {batch.landed}/{batch.orders}
        </span>
        {batch.failed > 0 ? <span className="text-role-caption font-medium text-text-danger">{batch.failed} failed</span> : null}
      </span>
    ),
  },
];

export function RecentImports() {
  const router = useRouter();
  const batches = useInboundImportBatches();
  if (batches.isError) {
    return <p className="px-4 pb-4 text-role-caption text-text-danger">Could not load recent uploads: {batches.error.message}</p>;
  }
  return (
    <AdminTable
      columns={COLUMNS}
      rows={batches.data ?? []}
      rowKey={(batch) => batch.id}
      loading={batches.isPending}
      loadingRows={4}
      emptyMessage="Uploaded files show here, each with its upload check."
      onRowClick={(batch) => router.push(purchaseImportCheckHref(batch.id))}
      stickyHeader={false}
    />
  );
}
