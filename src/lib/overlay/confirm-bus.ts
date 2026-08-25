/**
 * Imperative confirm BUS — the non-React half of the confirm dialog.
 *
 * Rescued out of `@/design-system/components/confirm` (Warehouse-OS): domain
 * code (`use-switch-org`, `useConfirmedAction`) must be able to ASK for a
 * confirmation without importing an AlertDialog. The host component subscribes
 * here and paints; this module owns the pending request and the promise.
 */

export type ConfirmRequest = {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
};

export type PendingConfirm = ConfirmRequest & {
  resolve: (value: boolean) => void;
};

let pending: PendingConfirm | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

/** Current pending request, or null. Read by the host on every notify. */
export function readPendingConfirm(): PendingConfirm | null {
  return pending;
}

/** Subscribe the host to pending-request changes. Returns an unsubscribe. */
export function subscribeConfirm(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Settle the pending request. The host calls this from its confirm / cancel /
 * dismiss paths; it clears the slot, notifies, then resolves the promise.
 */
export function resolvePendingConfirm(value: boolean): void {
  const p = pending;
  pending = null;
  notify();
  p?.resolve(value);
}

/** Promise-based confirm. Resolves true on confirm, false on cancel/dismiss. */
export function requestConfirm(req: ConfirmRequest | string): Promise<boolean> {
  const normalized: ConfirmRequest =
    typeof req === 'string' ? { description: req } : req;

  return new Promise<boolean>((resolve) => {
    if (pending) {
      pending.resolve(false);
    }
    pending = { ...normalized, resolve };
    notify();
  });
}
