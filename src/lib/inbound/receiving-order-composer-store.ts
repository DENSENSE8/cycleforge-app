'use client';

/**
 * Open state of the `/incoming` inbound-order composer — the fixed-width
 * 2/3 | 1/3 triage form that takes over the desk stage. `null` = closed;
 * otherwise the order type the form opens on (the operator can change it —
 * the type is a classifier on the one form, not a different form).
 */

import type { InboundOrderType } from '@/lib/inbound/inbound-order-draft';

let current: InboundOrderType | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeReceivingOrderComposer(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getReceivingOrderComposerKind(): InboundOrderType | null {
  return current;
}

export function openReceivingOrderComposer(type: InboundOrderType): void {
  if (current === type) return;
  current = type;
  emit();
}

export function closeReceivingOrderComposer(): void {
  if (current == null) return;
  current = null;
  emit();
}
