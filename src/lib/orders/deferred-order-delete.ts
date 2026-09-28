'use client';

/**
 * Deferred order Delete with Undo (owner 2026-09-27). A hard `DELETE
 * /api/orders/[id]` cannot be taken back, so the verb removes the orders on
 * the CLIENT first — they swipe left off every feed (`dismiss.ts` hide) — and
 * shows "N orders deleted · Undo" bottom-right. Undo inside the window puts
 * them back (they swipe in) and nothing is sent. When the window ends, or the
 * page is left (`pagehide`), the DELETEs go out; an order the server refuses
 * (403 step-up / permission, 409 blocked) comes back with the reason.
 *
 * A deleted order STAYS hidden for the life of the page: order ids are never
 * reused, and the cached lists (the queue, the open record's deep-link row)
 * still hold it until a refetch lands — a slow or failed refetch used to
 * repaint the deleted order for good.
 *
 * Module state, not component state: the strip that pressed Delete unmounts
 * the moment the check-set clears, and a pending batch must outlive it.
 */

import {
  afterDismissPaint,
  hideRecords,
  markDismissed,
  restoreRecords,
} from '@/design-system/components/triage-card-list/dismiss';
import { toast } from '@/lib/toast';

/** How long Undo stays offered before the DELETEs are sent. */
export const ORDER_DELETE_UNDO_MS = 6000;

interface PendingBatch {
  ids: readonly number[];
  timer: number;
  toastId: string | number;
  onSettled: () => void;
}

const pending = new Set<PendingBatch>();
let unloadHooked = false;

type DeleteResult = { id: number; error: string | null };

async function deleteOne(id: number, keepalive: boolean): Promise<DeleteResult> {
  try {
    const res = await fetch(`/api/orders/${id}`, { method: 'DELETE', keepalive });
    if (res.ok) return { id, error: null };
    const body = (await res.json().catch(() => ({}))) as { error?: string; details?: string };
    if (res.status === 403) {
      return {
        id,
        error:
          body.error === 'STEPUP_REQUIRED'
            ? 'Deleting an order needs a PIN step-up first'
            : 'You do not have permission to delete an order',
      };
    }
    return { id, error: body.error ?? body.details ?? 'Could not delete the order' };
  } catch {
    return { id, error: 'Could not delete the order' };
  }
}

/** Send the batch's DELETEs; refused orders come back (swiping in) with the reason. */
async function commit(batch: PendingBatch, keepalive: boolean): Promise<void> {
  if (!pending.delete(batch)) return;
  window.clearTimeout(batch.timer);
  // A hovered toast outlives its duration; once the DELETEs go, Undo must not stay offered.
  toast.dismiss(batch.toastId);
  const results = await Promise.all(batch.ids.map((id) => deleteOne(id, keepalive)));
  const failed = results.filter((r) => r.error != null);
  if (failed.length > 0) {
    restoreRecords(failed.map((r) => r.id));
    toast.error(
      failed.length === 1
        ? `Order not deleted — ${failed[0]!.error}`
        : `${failed.length} orders not deleted — ${failed[0]!.error}`,
    );
  }
  batch.onSettled();
}

/** Undo: the orders come back (swiping in), nothing is sent. */
function undo(batch: PendingBatch): void {
  if (!pending.delete(batch)) return;
  window.clearTimeout(batch.timer);
  restoreRecords(batch.ids);
}

/** Leaving the page ends every Undo window: send what is pending (`keepalive` outlives the page). */
function flushOnLeave(): void {
  for (const batch of [...pending]) void commit(batch, true);
}

/**
 * Delete `ids` with an Undo window: they swipe off the list now, the server
 * hears about it when the window ends. `onSettled` runs after the DELETEs
 * (bust the caches that listed them — counts, other desks).
 */
export async function deleteOrdersWithUndo(ids: readonly number[], onSettled: () => void): Promise<void> {
  if (ids.length === 0) return;
  if (!unloadHooked) {
    unloadHooked = true;
    window.addEventListener('pagehide', flushOnLeave);
  }
  // One paint with the swipe exit on the cards, then drop them.
  markDismissed(ids);
  await afterDismissPaint();
  hideRecords(ids);

  const batch = { ids, onSettled } as PendingBatch;
  batch.toastId = toast.undo(ids.length === 1 ? 'Order deleted' : `${ids.length} orders deleted`, {
    duration: ORDER_DELETE_UNDO_MS,
    onUndo: () => undo(batch),
  });
  batch.timer = window.setTimeout(() => void commit(batch, false), ORDER_DELETE_UNDO_MS);
  pending.add(batch);
}
