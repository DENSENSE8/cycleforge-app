import type { ItemRecordReceiveState } from './item-record-types';

/**
 * Idle vs active vs receiveState face. Fill + inset outline (M3), never
 * box-shadow (F3). Search / pack / shipped omit receiveState and stay idle.
 *
 * Open / Partial / exception heat. Received recedes. Active is the raised
 * plate; heat then rides as outline so the working row is still the loudest.
 */
export const ITEM_RECORD_RECEIVE_PAINT = {
  open: {
    idle: 'bg-surface-warning outline outline-1 -outline-offset-1 outline-border-warning',
    active: 'outline outline-2 -outline-offset-2 outline-border-warning',
  },
  partial: {
    idle: 'bg-surface-warning outline outline-1 -outline-offset-1 outline-border-warning',
    active: 'outline outline-2 -outline-offset-2 outline-border-warning',
  },
  received: {
    idle: 'border-0 bg-transparent opacity-55',
    active: '',
  },
  short: {
    idle: 'bg-surface-danger outline outline-1 -outline-offset-1 outline-border-danger',
    active: 'outline outline-2 -outline-offset-2 outline-border-danger',
  },
  over: {
    idle: 'bg-surface-warning outline outline-1 -outline-offset-1 outline-border-warning',
    active: 'outline outline-2 -outline-offset-2 outline-border-warning',
  },
  damaged: {
    idle: 'bg-surface-danger outline outline-1 -outline-offset-1 outline-border-danger',
    active: 'outline outline-2 -outline-offset-2 outline-border-danger',
  },
  wrong_item: {
    idle: 'bg-surface-danger outline outline-1 -outline-offset-1 outline-border-danger',
    active: 'outline outline-2 -outline-offset-2 outline-border-danger',
  },
} as const satisfies Record<ItemRecordReceiveState, { idle: string; active: string }>;

export const ITEM_RECORD_IDLE_CLASS = 'border-0 bg-transparent';

export function itemRecordRowPaintClass(opts: {
  active: boolean;
  receiveState?: ItemRecordReceiveState | null;
}): string {
  const paint = opts.receiveState ? ITEM_RECORD_RECEIVE_PAINT[opts.receiveState] : null;
  if (!paint) return opts.active ? '' : ITEM_RECORD_IDLE_CLASS;
  return opts.active ? paint.active : paint.idle;
}
