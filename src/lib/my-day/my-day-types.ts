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

/**
 * One My Day feed item — a work order or an interrupt — as the task read
 * model (`my-day-tasks.ts`) carries it. One declaration, never a structural copy.
 */
export type MyDaySelectedItem =
  | { kind: 'work_order'; row: WorkOrderRow }
  | { kind: 'interrupt'; item: MyDayInterrupt };

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