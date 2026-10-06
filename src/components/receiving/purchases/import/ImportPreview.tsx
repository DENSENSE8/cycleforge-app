'use client';

/**
 * Import orders › Preview — the dry run, by order, grouped New · Updated ·
 * Unchanged · Held (· Failed): each order's number (last 8, copies full),
 * its lines and units, and every problem with the file row it is on. Rows
 * with no order number are held on their own, never dropped.
 */

import { useMemo } from 'react';
import { AdminTable, type AdminTableColumn } from '@/design-system/components/AdminTable/AdminTable';
import { OperationalIdentityChip } from '@/design-system/components/OperationalIdentityChip';
import { importedOrderIdentity } from '@/lib/operational-identity';
import { PO_COLUMNS } from '@/lib/inbound/po-columns';
import type { PoReviewGroup, PoReviewLine, PoReviewOrder, PoReviewStatus } from '@/lib/inbound/po-csv-review';
import { cn } from '@/utils/_cn';

const PO_REVIEW_STATUS_FACE: Readonly<Record<PoReviewStatus, { label: string; tone: string }>> = {
  new: { label: 'New', tone: 'text-text-success' },
  updated: { label: 'Updated', tone: 'text-text-default' },
  unchanged: { label: 'Unchanged', tone: 'text-text-muted' },
  needs_fix: { label: 'Held', tone: 'text-text-warning' },
  failed: { label: 'Failed', tone: 'text-text-danger' },
};

/** The order's problems, each on its file row (1-based, as the operator's spreadsheet numbers it). */
function OrderProblems({ order }: { order: PoReviewOrder }) {
  const rowProblems = order.lines.flatMap((line) => line.problems);
  if (rowProblems.length === 0 && order.orderProblems.length === 0) return <span className="text-text-faint">None</span>;
  return (
    <ul className="flex flex-col gap-0.5 text-text-warning">
      {rowProblems.map((problem) => (
        <li key={`${problem.row}:${problem.field}`}>
          Row {problem.row + 1} · {PO_COLUMNS[problem.field].label}: {problem.message}
        </li>
      ))}
      {order.orderProblems.map((problem) => (
        <li key={problem}>{problem}</li>
      ))}
    </ul>
  );
}

/** The order columns — the order number is an identity on the platform this import stamps. */
function orderColumns(platform: string): AdminTableColumn<PoReviewOrder>[] {
  return [
    {
      key: 'order',
      header: 'Order #',
      type: 'id',
      cell: (order) => <OperationalIdentityChip identity={importedOrderIdentity(order.orderNumber, platform)} presentation="compact" />,
    },
    {
      key: 'title',
      header: 'First item',
      type: 'text',
      cell: (order) => <span className="block max-w-64 truncate">{order.lines[0]?.title ?? '—'}</span>,
    },
    { key: 'lines', header: 'Lines', type: 'number', cell: (order) => order.lines.length },
    { key: 'units', header: 'Units', type: 'number', cell: (order) => order.units },
    { key: 'problems', header: 'Problems', type: 'text', cell: (order) => <OrderProblems order={order} /> },
  ];
}

const ORPHAN_COLUMNS: AdminTableColumn<PoReviewLine>[] = [
  { key: 'row', header: 'Row', type: 'number', cell: (line) => line.row + 1 },
  { key: 'title', header: 'Item', type: 'text', cell: (line) => line.title ?? '—' },
  {
    key: 'problems',
    header: 'Problems',
    type: 'text',
    cell: (line) => <span className="text-text-warning">{line.problems.map((p) => p.message).join(' · ') || 'No order #'}</span>,
  },
];

/** `groups` come from `groupPoReviewOrders` — in review order, empty groups already left out. */
export function ImportPreview({
  groups,
  orphans,
  platform,
}: {
  groups: readonly PoReviewGroup[];
  orphans: readonly PoReviewLine[];
  /** The platform slug the import stamps on every order. */
  platform: string;
}) {
  const columns = useMemo(() => orderColumns(platform), [platform]);
  if (groups.length === 0 && orphans.length === 0) {
    return <p className="px-4 pb-4 text-role-caption text-text-muted">No orders in this file.</p>;
  }
  return (
    <div className="flex flex-col gap-3 px-4 pb-4">
      {groups.map((group) => {
        const face = PO_REVIEW_STATUS_FACE[group.status];
        return (
          <section key={group.status} aria-label={face.label} data-import-preview-group={group.status} className="flex flex-col gap-1">
            <h4 className={cn('text-role-caption font-semibold', face.tone)}>
              {face.label} · {group.orders.length} {group.orders.length === 1 ? 'order' : 'orders'}
            </h4>
            <AdminTable columns={columns} rows={[...group.orders]} rowKey={(order) => order.key} stickyHeader={false} />
          </section>
        );
      })}
      {orphans.length > 0 ? (
        <section aria-label="Held rows with no order number" className="flex flex-col gap-1">
          <h4 className="text-role-caption font-semibold text-text-warning">
            Held · {orphans.length} {orphans.length === 1 ? 'row' : 'rows'} with no order #
          </h4>
          <AdminTable columns={ORPHAN_COLUMNS} rows={[...orphans]} rowKey={(line) => String(line.row)} stickyHeader={false} />
        </section>
      ) : null}
    </div>
  );
}
