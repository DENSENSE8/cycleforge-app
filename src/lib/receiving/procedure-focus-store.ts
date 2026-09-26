'use client';

/** Which procedure step the operator has stepped BACK to — shared by every surface that shows the procedure. */

import { useSyncExternalStore } from 'react';

interface FocusSnapshot {
  cartonId: number | null;
  stepKey: string | null;
}

const EMPTY: FocusSnapshot = { cartonId: null, stepKey: null };

let snapshot: FocusSnapshot = EMPTY;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): FocusSnapshot {
  return snapshot;
}

/**
 * Step back to a settled step on `cartonId`, or `null` to release the override
 * and let the derived pointer take over again.
 */
export function setFocusedStep(cartonId: number | null, stepKey: string | null): void {
  if (snapshot.cartonId === cartonId && snapshot.stepKey === stepKey) return;
  snapshot = stepKey == null ? EMPTY : { cartonId, stepKey };
  emit();
}

/** Drop any focus that does not belong to `cartonId`. Cheap to call on mount. */
export function clearFocusForOtherCarton(cartonId: number | null): void {
  if (snapshot.stepKey != null && snapshot.cartonId !== cartonId) {
    snapshot = EMPTY;
    emit();
  }
}

/**
 * The focused step for THIS carton, or `null`. A focus belonging to a different
 * carton reads as `null` rather than leaking across a scan.
 */
export function useFocusedStep(cartonId: number | null): string | null {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return current.cartonId === cartonId ? current.stepKey : null;
}
