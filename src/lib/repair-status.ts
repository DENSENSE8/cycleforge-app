// Repair-service (RS) status badge classes; the tone itself is `REPAIR_STATUS` (design-system tokens).

import { REPAIR_STATUS } from '@/design-system/tokens/repair-status';
import type { RepairTab } from '@/lib/neon/repair-service-queries';

type RepairStatusHue = 'warning' | 'info' | 'success' | 'danger' | 'neutral';

const HUE_BADGE: Record<RepairStatusHue, string> = {
  warning: 'bg-amber-100 text-amber-800 border-amber-200',
  info: 'bg-blue-100 text-blue-700 border-blue-200',
  success: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  danger: 'bg-rose-100 text-rose-700 border-rose-200',
  neutral: 'bg-surface-sunken text-text-muted border-border-soft',
};

const HUE_CHIP: Record<RepairStatusHue, string> = {
  warning: 'bg-amber-50 text-amber-700',
  info: 'bg-blue-50 text-blue-600',
  success: 'bg-emerald-50 text-emerald-600',
  danger: 'bg-rose-50 text-rose-600',
  neutral: 'bg-surface-canvas text-text-muted',
};

/** The one canonical hue for a stored status (`neutral` when unknown). */
export function repairStatusHue(status: string): RepairStatusHue {
  const tone = REPAIR_STATUS[status]?.tone;
  return tone && tone !== 'fulfillment' ? tone : 'neutral';
}

/** Bordered pill classes (mobile station + toggle buttons). */
export function repairStatusBadgeClass(status: string): string {
  return HUE_BADGE[repairStatusHue(status)];
}

/** Flat chip classes (desktop ops modal). */
export function repairStatusChipClass(status: string): string {
  return HUE_CHIP[repairStatusHue(status)];
}

/**
 * Stored statuses from which a customer pickup may start. Shared by the desk
 * details panel and the mobile workbench dock so the two cannot disagree about
 * when "Pickup" is live. `Done` stays eligible so staff can reopen the receipt.
 */
const REPAIR_PICKUP_STATUSES: Record<string, true> = {
  'Repaired, Contact Customer': true,
  'Awaiting Pickup': true,
  'Awaiting Payment': true,
  Done: true,
};

export function canStartRepairPickup(status: string | null | undefined): boolean {
  return REPAIR_PICKUP_STATUSES[(status || '').trim()] === true;
}

/**
 * The closing statuses and how a closed ticket reads (the card's top-right,
 * Cmd-K): nothing left to do, so no SLA presses once a ticket is here.
 */
export const REPAIR_CLOSED_FACE: Readonly<Record<string, string>> = {
  Shipped: 'Shipped',
  'Picked Up': 'Picked up',
  Done: 'Closed',
  Cancelled: 'Cancelled',
};

export function isRepairClosed(status: string | null | undefined): boolean {
  return REPAIR_CLOSED_FACE[(status || '').trim()] != null;
}

/** The Status (`?tab=`) whose list carries a ticket in `status` — a deep link lands where its card is. */
export function repairTabForStatus(status: string | null | undefined): RepairTab {
  const stored = (status || '').trim();
  if (stored === 'Incoming Shipment') return 'incoming';
  // Cancelled hides from every tab but All (`buildRepairTabWhere`).
  if (stored === 'Cancelled') return 'all';
  return isRepairClosed(stored) ? 'done' : 'active';
}

/**
 * Operator wording for the controlled stored values. The stored values are
 * shared with the repair queue, next-job selection, and AI intent routing —
 * surfaces may reword them, never invent incompatible ones.
 */
const REPAIR_STATUS_OPERATOR_LABEL: Record<string, string> = {
  'Pending Repair': 'In repair',
  'Awaiting Parts': 'Waiting on parts',
  'Repaired, Contact Customer': 'Repair complete — contact customer',
  'Awaiting Pickup': 'Ready for pickup',
  'Awaiting Payment': 'Waiting on payment',
  Done: 'Closed',
};

/** Stored values the mobile workbench offers, in bench order. */
export const REPAIR_WORKBENCH_STATUSES = [
  'Pending Repair',
  'Awaiting Parts',
  'Repaired, Contact Customer',
  'Awaiting Pickup',
  'Awaiting Payment',
  'Done',
] as const;

export function repairStatusOperatorLabel(status: string): string {
  return REPAIR_STATUS_OPERATOR_LABEL[status] ?? status;
}
