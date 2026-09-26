/** One-shot "Replace tracking" intent for the order inspector. */

type Listener = () => void;

let pendingOrderId: number | null = null;
let generation = 0;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Arm a replace-tracking intent for `orderId`. Notifies subscribers. */
export function armReplaceTrackingIntent(orderId: number): void {
  if (!Number.isFinite(orderId) || orderId <= 0) return;
  pendingOrderId = orderId;
  generation += 1;
  emit();
}

/**
 * Consume a pending intent for `orderId`. Returns true once; subsequent calls
 * for the same arm return false until the next {@link armReplaceTrackingIntent}.
 */
export function consumeReplaceTrackingIntent(orderId: number): boolean {
  if (pendingOrderId == null) return false;
  if (Number(orderId) !== pendingOrderId) return false;
  pendingOrderId = null;
  return true;
}

/** Peek without consuming — tests / debug. */
export function peekReplaceTrackingIntent(): { orderId: number; generation: number } | null {
  if (pendingOrderId == null) return null;
  return { orderId: pendingOrderId, generation };
}

export function subscribeReplaceTrackingIntent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper — clear pending state between cases. */
export function resetReplaceTrackingIntentForTests(): void {
  pendingOrderId = null;
  generation = 0;
}
