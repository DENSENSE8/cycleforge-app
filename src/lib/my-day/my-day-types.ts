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
 * The rail's current pick, shared by every module in the My Day split
 * (`MyDayRail` writes it, `MyDayWorkspace` holds it, `MyDayTriagePane` /
 * `MyDayContextPane` read it). One declaration — three structurally identical
 * copies is the fork this consolidation removes.
 *
 * Selection is local component state today, not URL-durable: F0 is a display
 * extraction and adds no routing (`daily-triage-FRONTEND-PLAN-VALIDATION.md`).
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