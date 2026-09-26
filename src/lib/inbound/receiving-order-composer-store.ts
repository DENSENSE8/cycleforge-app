'use client';

/**
 * Open state of the `/incoming` receiving-order composer — the centred,
 * fixed-width Add surface that takes over the desk stage on either lane.
 * `null` = closed; otherwise the kind of order being added.
 */

export type ReceivingOrderKind = 'purchase' | 'return';

let current: ReceivingOrderKind | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeReceivingOrderComposer(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getReceivingOrderComposerKind(): ReceivingOrderKind | null {
  return current;
}

export function openReceivingOrderComposer(kind: ReceivingOrderKind): void {
  if (current === kind) return;
  current = kind;
  emit();
}

export function closeReceivingOrderComposer(): void {
  if (current == null) return;
  current = null;
  emit();
}
