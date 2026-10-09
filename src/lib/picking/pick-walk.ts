/**
 * The phone's pick walk (`/m/pick`, owner 2026-09-28) — the pure half.
 *
 * My list is the orders whose live PICK assignee (`picker_id`, the latest
 * ORDER/PICK `work_assignments` row) is me, FIRST; then the unowned orders
 * anyone may take. Another picker's orders are never on it. Within each tier
 * the desk's own order (ship-by) holds. Start picking walks the To-pick part
 * of that list, in list order.
 */

import type { ShippedOrder } from '@/types/orders';
import { toPSTDateKey } from '@/utils/date';

/** Whose an order is, to the signed-in picker. */
export type PickOwnerTier = 'mine' | 'unowned' | 'other';

/** An order is mine when any of its lines is assigned to me; unowned when none is assigned to anyone. */
export function pickOwnerTier(lines: readonly ShippedOrder[], staffId: number | null): PickOwnerTier {
  let assigned = false;
  for (const line of lines) {
    const picker = Number(line.picker_id) || null;
    if (picker == null) continue;
    if (staffId != null && picker === staffId) return 'mine';
    assigned = true;
  }
  return assigned ? 'other' : 'unowned';
}

/**
 * The walk's next order after `current`: the first id after it in `walk`
 * that is still `open` and not `skipped`. `current` missing from `walk`
 * (opened from outside it) → the first open one.
 */
export function nextInWalk(
  walk: readonly number[],
  current: number,
  open: ReadonlySet<number>,
  skipped: ReadonlySet<number> = new Set(),
): number | null {
  const from = walk.indexOf(current) + 1;
  for (let i = from; i < walk.length; i += 1) {
    const id = walk[i]!;
    if (id !== current && open.has(id) && !skipped.has(id)) return id;
  }
  return null;
}

/**
 * The walk's progress bar: orders I picked today (any line's `picked_by` is
 * me and its `picked_at` falls on `todayKey`, PST) ÷ those plus my walk still
 * to pick. Each order counts once.
 */
export function pickWalkProgress(
  orders: readonly (readonly ShippedOrder[])[],
  staffId: number | null,
  todayKey: string,
  remaining: number,
): { picked: number; total: number } {
  let picked = 0;
  if (staffId != null) {
    for (const lines of orders) {
      if (lines.some((line) => Number(line.picked_by) === staffId && toPSTDateKey(line.picked_at) === todayKey)) picked += 1;
    }
  }
  return { picked, total: picked + remaining };
}
