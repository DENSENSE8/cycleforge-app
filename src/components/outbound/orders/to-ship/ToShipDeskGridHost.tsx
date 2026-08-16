'use client';

/**
 * To-Ship desk spreadsheet — desk-local binding over the shared orders grid
 * adapter. Row renderers, selection plane, and in-cell edit stay on the orders
 * queue stack; only the definition / prefs bucket fork here.
 */

import { OrdersGridHost } from '@/components/dashboard/orders-queue/OrdersGridHost';
import type { OrdersGridHostProps } from '@/components/dashboard/orders-queue/OrdersGridHost';
import { toShipDeskTableBindingFor } from './to-ship-desk-table-definition';

type ToShipDeskGridHostProps = Omit<OrdersGridHostProps, 'tableId' | 'tableBindingFor'>;

export function ToShipDeskGridHost(props: ToShipDeskGridHostProps) {
  return (
    <OrdersGridHost
      {...props}
      tableId="to-ship-desk"
      tableBindingFor={toShipDeskTableBindingFor}
      data-testid={props['data-testid'] ?? 'to-ship-desk-grid-body'}
    />
  );
}
