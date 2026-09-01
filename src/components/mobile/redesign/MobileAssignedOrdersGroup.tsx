'use client';

/**
 * Homepage inset "Orders" preview for the mobile shell.
 *
 * "Orders" top-left, view-all chevron top-right, the three most urgent assigned
 * orders in the body (last-8 order / tracking chips). When nothing is assigned,
 * the empty body is the door to `/m/work?tab=all`.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight } from '@/components/Icons';
import { IconButton, Inset, Panel, PanelRow } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import type { WorkOrderRow } from '@/components/work-orders/types';
import {
  DEADLINE_BAND_LABEL,
  classifyDeadlineBand,
  mobileAssignedOrderHref,
} from '@/lib/work-orders/deadline-bands';
import { ToShipIdentityChips } from '@/components/mobile/redesign/MobileToShipRow';
import { useAssignedWorkOrders } from './useAssignedWorkOrders';

function AssignedOrderLine({ row }: { row: WorkOrderRow }) {
  const band = classifyDeadlineBand(row.deadlineAt);
  return (
    <div className="flex w-full items-start justify-between gap-2 py-1.5">
      <div className="min-w-0 flex-1">
        <Link
          href={mobileAssignedOrderHref(row)}
          className="block min-w-0 text-left active:bg-surface-hover"
        >
          <span className="block truncate text-role-caption font-semibold text-text-default">
            {row.title}
          </span>
        </Link>
        <ToShipIdentityChips row={row} />
      </div>
      <span className="shrink-0 pt-0.5 text-role-eyebrow uppercase tracking-widest text-text-muted">
        {DEADLINE_BAND_LABEL[band]}
      </span>
    </div>
  );
}

export function MobileAssignedOrdersGroup() {
  const router = useRouter();
  const { preview: previewRows, isPending, isError } = useAssignedWorkOrders();
  const hasRows = previewRows.length > 0;
  const viewHref = hasRows ? '/m/work?tab=assigned' : '/m/work?tab=all';

  const viewAll = (
    <IconButton
      size="md"
      ariaLabel="View all orders"
      icon={<ChevronRight className="h-4 w-4" />}
      onClick={() => router.push(viewHref)}
    />
  );

  return (
    <Panel
      padding="none"
      radius="none"
      elevation="raised"
      data-testid="assigned-orders-group"
      className={cn(cornerClass('surface'), 'w-full')}
    >
      <Inset space="field">
        <PanelRow
          label="Orders"
          actions={viewAll}
          interactive={false}
          dividerClassName=""
        >
          {isPending ? (
            <p className="text-role-caption text-text-muted">Loading…</p>
          ) : isError ? (
            <p className="text-role-caption text-text-muted">Couldn&apos;t load orders.</p>
          ) : previewRows.length === 0 ? (
            <Link
              href="/m/work?tab=all"
              data-testid="view-all-orders-empty"
              className="flex w-full items-center justify-between gap-2 py-1.5 text-left active:bg-surface-hover"
            >
              <span className="text-role-caption text-text-muted">None assigned</span>
              <span className="text-role-caption font-semibold text-text-default">View all</span>
            </Link>
          ) : (
            <ul className="divide-y divide-border-hairline">
              {previewRows.map((row) => (
                <li key={row.id}>
                  <AssignedOrderLine row={row} />
                </li>
              ))}
            </ul>
          )}
        </PanelRow>
      </Inset>
    </Panel>
  );
}
