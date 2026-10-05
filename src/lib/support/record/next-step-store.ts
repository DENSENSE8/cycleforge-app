'use client';

/**
 * Which Support items owe their next-step choice (Waiting for customer · Follow up later · Resolve) —
 * keyed by item id, held OUTSIDE any component. It is opened by the write that answered the customer
 * (a reply sent or logged, a copy marked sent) and closed by the step that was chosen, so it survives
 * a bundle refetch, a composer remount and a tab switch inside the session.
 */

import { useSyncExternalStore } from 'react';

const owed = new Set<number>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function openSupportNextStep(supportItemId: number): void {
  if (owed.has(supportItemId)) return;
  owed.add(supportItemId);
  emit();
}

export function closeSupportNextStep(supportItemId: number): void {
  if (!owed.delete(supportItemId)) return;
  emit();
}

/** Whether item `supportItemId` still owes its next-step choice (the hook's snapshot; tests read it directly). */
export function isSupportNextStepOwed(supportItemId: number): boolean {
  return owed.has(supportItemId);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSupportNextStepOpen(supportItemId: number): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isSupportNextStepOwed(supportItemId),
    () => false,
  );
}
