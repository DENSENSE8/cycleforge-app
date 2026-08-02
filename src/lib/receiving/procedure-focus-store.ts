'use client';

/**
 * Which procedure step the operator has stepped BACK to — shared by every
 * surface that shows the procedure.
 *
 * ## Why a store and not `useState`
 *
 * Two surfaces render the Unbox procedure at once: the work cards in the centre
 * and the checklist on the right edge. The checklist is the map, so clicking a
 * row there has to move the CARDS. With the focus held in each surface's own
 * `useState`, both would render a pointer and only their own clicks would move
 * it — two pointers on screen, disagreeing, which is exactly the failure the
 * shared derivation exists to prevent, arriving through the back door.
 *
 * So the focus is one value outside React, and both surfaces subscribe.
 *
 * ## It is EPHEMERAL, and never the URL
 *
 * A Station's selection is ephemeral by contract — act-and-clear, never
 * URL-addressable (`display/station.md` §5). A `?step=` param would make a
 * half-worked carton shareable and reloadable, which is a Workbench affordance
 * and wrong here: the pointer's resting state is always "the first unsettled
 * step", derived from the carton's own evidence, and the focus is only a
 * temporary override on top of it.
 *
 * ## Clearing on carton change is the CALLER's job, and it is not optional
 *
 * The store is keyed by carton so a stale focus cannot leak: `setFocusedStep`
 * takes the carton it belongs to, and a read for a different carton returns
 * `null`. Without that, scanning a new box would open it parked on whatever step
 * the previous one was left on — the same class of bug as a selection bleeding
 * across modes.
 *
 * Same module-store shape as `src/lib/right-rail/store.ts` and
 * `src/lib/overlay-stack/store.ts`; deliberately not a React context, so a
 * non-React caller (a scan handler clearing the focus on a new carton) can use
 * it imperatively.
 */

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
