import type { WorkOrderRow } from '@/components/work-orders/types';

export type MyDayInterruptKind =
  | 'return_pending_test'
  | 'order_ready_ship'
  | 'support_followup';

export interface MyDayInterrupt {
  id: string;
  kind: MyDayInterruptKind;
  title: string;
  subtitle: string;
  href: string;
  createdAtMs: number;
  ticketId?: number;
  receivingId?: number;
  lineId?: number;
}

export interface MyDayQueueCard {
  key: string;
  label: string;
  count: number;
  href: string;
  permission: string;
}

export interface MyDayFeed {
  doNext: WorkOrderRow | null;
  assigned: WorkOrderRow[];
  interrupts: MyDayInterrupt[];
  queueCards: MyDayQueueCard[];
  counts: {
    assigned: number;
    interrupts: number;
    unassigned: number;
  };
}