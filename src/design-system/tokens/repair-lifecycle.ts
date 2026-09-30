import type { StateName } from './lifecycle';

/**
 * The repair ladder — where the device is in its repair (owner 2026-09-30):
 * Checked in → Received → Label printed → In repair → Repaired → Awaiting
 * payment (only when used) → Ready / Shipped back → Closed. One code, word and
 * tone per step (tones are `STATE_TONE_CLASSES` names). Branch states (Awaiting
 * Parts, Awaiting Additional Parts Payment) are sub-states of In repair, never
 * steps. The sibling of `INBOUND_LIFECYCLE`; the stored-status faces stay in
 * `REPAIR_STATUS`.
 */
export const REPAIR_LIFECYCLE = {
  checkedIn: { tone: 'info', code: 'CHK', label: 'Checked in' },
  received: { tone: 'info', code: 'RCV', label: 'Received' },
  labeled: { tone: 'info', code: 'LBL', label: 'Label printed' },
  inRepair: { tone: 'warning', code: 'RPR', label: 'In repair' },
  repaired: { tone: 'warning', code: 'FIX', label: 'Repaired' },
  awaitingPayment: { tone: 'danger', code: 'PAY', label: 'Awaiting payment' },
  ready: { tone: 'success', code: 'RDY', label: 'Ready for pickup' },
  closed: { tone: 'success', code: 'CLS', label: 'Closed' },
} as const satisfies Record<string, { tone: StateName; code: string; label: string }>;

export type RepairLifecycleStep = keyof typeof REPAIR_LIFECYCLE;
