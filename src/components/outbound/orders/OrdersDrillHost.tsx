'use client';

/**
 * To-ship Orders drill — thin adapter over {@link LedgerDrillHost}.
 *
 * Pending scaffold: parent map = order groups; child = lines for the selected
 * order. List mode stays the classic single {@link OrdersGridView}.
 */

import { useCallback, useMemo, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { dispatchOpenShippedDetails } from '@/utils/events';
import { unshippedOrdersQuery } from '@/lib/queries/dashboard-queries';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import {
  LedgerDrillHost,
  LedgerDrillParentMap,
  type LedgerDrillParentSection,
} from '@/design-system/components/grid';
import { OrdersGridView } from '@/components/dashboard/orders-queue/OrdersGridView';
import { useOrdersQueueRows } from '@/components/dashboard/orders-queue/useOrdersQueueRows';
import { useQueueDisplaySort } from '@/hooks/useQueueDisplaySort';
import { useDashboardSearchController } from '@/hooks/useDashboardSearchController';
import { OrderIdChip, getLast8 } from '@/components/ui/CopyChip';
import { formatDateKeyShort } from '@/utils/date';
import { deriveFulfillmentState } from '@/lib/unshipped-state';
import type { ShippedOrder } from '@/types/orders';
import {
  ORDERS_DRILL_ORDER_PARAM,
  parseOrdersDrillLayout,
  parseOrdersDrillOrder,
  writeOrdersDrillParams,
} from '@/lib/shipping/orders-drill-layout';
import { cn } from '@/utils/_cn';

function fulfillmentSignals(r: ShippedOrder) {
  const row = r as ShippedOrder & {
    has_tech_scan?: boolean;
    is_out_of_stock?: boolean;
  };
  return {
    hasTechScan: Boolean(row.has_tech_scan),
    isOutOfStock: Boolean(row.is_out_of_stock),
  };
}

function trackingHay(r: ShippedOrder): string {
  const row = r as ShippedOrder & {
    tracking_number?: string | null;
    shipping_tracking_number?: string | null;
  };
  const nums = Array.isArray(r.tracking_numbers) ? r.tracking_numbers.join(' ') : '';
  return [row.tracking_number, row.shipping_tracking_number, nums]
    .map((v) => String(v || ''))
    .join(' ');
}

function metaSep() {
  return (
    <span className="shrink-0 text-text-faint" aria-hidden>
      ·
    </span>
  );
}

function parentMeta(rows: ShippedOrder[]): ReactNode {
  const qty = rows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
  const orderId = String(rows[0]?.order_id || '').trim();
  const parts: ReactNode[] = [
    <span key="qty" className="shrink-0 tabular-nums">
      {qty || rows.length}
    </span>,
  ];
  if (orderId) {
    parts.push(metaSep());
    parts.push(
      <OrderIdChip key="order" value={orderId} display={getLast8(orderId)} dense />,
    );
  }
  parts.push(metaSep());
  parts.push(
    <span key="lines" className="shrink-0 tabular-nums text-text-muted">
      {rows.length} line{rows.length === 1 ? '' : 's'}
    </span>,
  );
  return <>{parts}</>;
}

export function OrdersDrillHost({
  selectMode = false,
  className,
}: {
  selectMode?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const drillOrder = parseOrdersDrillOrder(
    searchParams.get(ORDERS_DRILL_ORDER_PARAM),
  );
  const { searchQuery, setSearch } = useDashboardSearchController();
  const { sort, dir } = useQueueDisplaySort();

  const { data, isPending } = useQuery(unshippedOrdersQuery());
  const rawRecords = (data ?? []) as ShippedOrder[];

  // Pending lane only for this scaffold (exclude TESTED).
  const pendingRecords = useMemo(
    () =>
      rawRecords.filter((r) => {
        const state = deriveFulfillmentState(fulfillmentSignals(r));
        return state === 'PENDING' || state === 'BLOCKED';
      }),
    [rawRecords],
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return pendingRecords;
    return pendingRecords.filter((r) => {
      const hay = [
        r.order_id,
        r.product_title,
        trackingHay(r),
        r.serial_number,
        r.item_number,
      ]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });
  }, [pendingRecords, searchQuery]);

  const { orderGroupsByDate } = useOrdersQueueRows({
    records: filtered,
    sort,
    dir,
    queueMode: 'fulfillment',
  });

  const parentSections = useMemo((): LedgerDrillParentSection[] => {
    const sections: LedgerDrillParentSection[] = [];
    for (const [day, groups] of orderGroupsByDate) {
      const sectionId = day || 'unknown';
      sections.push({
        id: sectionId,
        label: day ? formatDateKeyShort(day) : 'Undated',
        rows: groups.map((group) => {
          const first = group.rows[0];
          const title =
            String(first?.order_id || '').trim() ||
            first?.product_title ||
            'Order';
          return {
            key: `${sectionId}::${group.key}`,
            title,
            meta: parentMeta(group.rows),
          };
        }),
      });
    }
    return sections;
  }, [orderGroupsByDate]);

  const selectedChildRecords = useMemo(() => {
    if (!drillOrder) return [] as ShippedOrder[];
    for (const [day, groups] of orderGroupsByDate) {
      const sectionId = day || 'unknown';
      for (const group of groups) {
        if (`${sectionId}::${group.key}` === drillOrder) return group.rows;
      }
    }
    return [] as ShippedOrder[];
  }, [orderGroupsByDate, drillOrder]);

  const setDrillOrder = useCallback(
    (key: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      const layout = parseOrdersDrillLayout(params.get('olayout'));
      writeOrdersDrillParams(params, layout, key);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    <LedgerDrillHost
      className={cn(className)}
      storageKey="cf.ordersDrill.splitRatio"
      hasSelection={selectedChildRecords.length > 0}
      onClearSelection={() => setDrillOrder(null)}
      emptySelectionMessage="Select an order."
      narrowBackLabel="← Orders"
      resizeLabel="Resize orders drill panes"
      resizeTestId="orders-drill-split-resize"
      testId="orders-drill-host"
      parents={
        <LedgerDrillParentMap
          title="Orders"
          sections={parentSections}
          selectedKey={drillOrder}
          onSelect={(key) => setDrillOrder(key)}
          loading={isPending}
          emptyMessage="No orders to ship"
          testId="orders-drill-parents"
        />
      }
    >
      <OrdersGridView
        records={selectedChildRecords}
        loading={false}
        searchValue={searchQuery}
        onOpenRecord={(record) => dispatchOpenShippedDetails(record, 'queue')}
        onClearSearch={() => setSearch('')}
        emptyMessage="No lines in this order."
        selectMode={selectMode}
        selectionScope={DASHBOARD_ORDERS_SELECTION_SCOPE}
        railSelection
        queueMode="fulfillment"
        ariaLabel="Order lines"
        data-testid="orders-drill-children"
      />
    </LedgerDrillHost>
  );
}
