import type { WorkOrderRow } from '@/components/work-orders/types';
import { buildSourceHref } from '@/components/work-orders/types';
import type { MyDayInterrupt } from './my-day-types';

export function workOrderHref(row: WorkOrderRow): string {
  if (row.entityType === 'ORDER' && row.orderId) {
    const params = new URLSearchParams();
    params.set('openOrderId', String(row.orderId));
    return `/dashboard?${params.toString()}`;
  }
  return buildSourceHref(row);
}

export function interruptHref(item: Pick<MyDayInterrupt, 'kind' | 'ticketId' | 'receivingId' | 'lineId'>): string {
  if (item.kind === 'support_followup' && item.ticketId != null) {
    const params = new URLSearchParams();
    params.set('ticketId', String(item.ticketId));
    return `/support?${params.toString()}`;
  }
  if (item.lineId != null) {
    return `/triage?lineId=${item.lineId}`;
  }
  if (item.receivingId != null) {
    return `/triage?receivingId=${item.receivingId}`;
  }
  if (item.kind === 'order_ready_ship') return '/dashboard?unshipped';
  return '/test';
}