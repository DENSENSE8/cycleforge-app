'use client';

/**
 * Swipe-to-dismiss marks for a triage card list (owner 2026-09-27): records a
 * verb removes for good (Delete) leave the list through `SwipeListItem`'s
 * `exit="swipe"` — sliding left off the screen, one after another, while the
 * gap closes — and come back through its `enter="swipe"` when the removal is
 * undone.
 *
 * Three record-id sets, one store:
 * - **dismissed** — the card's exit is the swipe. Marked one paint BEFORE the
 *   card leaves, so the leaving card carries the swipe instead of the plain
 *   height collapse. Expires on its own.
 * - **hidden** — removed on the client (a Delete). A feed drops these rows at
 *   its source, so counts, pages and J / K skip them. A deleted record stays
 *   hidden for the life of the page (ids are never reused; a stale cache must
 *   not repaint it); only {@link restoreRecords} (Undo, a refused delete)
 *   brings one back.
 * - **returning** — restored: the card swipes back in. Expires on its own.
 *
 * Record ids, not card keys: the verb knows what it removed, the list knows
 * which card holds which ids.
 */

import { useSyncExternalStore } from 'react';

/** How long a dismiss / return mark outlives the move it announced. */
const MARK_TTL_MS = 8000;

type IdSet = ReadonlySet<number>;
const EMPTY: IdSet = new Set();

let dismissed: IdSet = EMPTY;
let hidden: IdSet = EMPTY;
let returning: IdSet = EMPTY;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

const withIds = (set: IdSet, ids: readonly number[]): IdSet => new Set([...set, ...ids]);
const withoutIds = (set: IdSet, ids: readonly number[]): IdSet => {
  const next = new Set(set);
  for (const id of ids) next.delete(id);
  return next;
};

/** Mark records a verb is removing for good; they swipe out when the list drops them. */
export function markDismissed(ids: readonly number[]): void {
  if (ids.length === 0) return;
  dismissed = withIds(dismissed, ids);
  returning = withoutIds(returning, ids);
  emit();
  window.setTimeout(() => {
    dismissed = withoutIds(dismissed, ids);
    emit();
  }, MARK_TTL_MS);
}

/** Resolves on the next paint — lets a marked card re-render with its swipe exit before it is removed. */
export function afterDismissPaint(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  return promise;
}

/** Drop records from every feed that honours {@link useHiddenRecords} (mark them dismissed first to swipe them out). */
export function hideRecords(ids: readonly number[]): void {
  if (ids.length === 0) return;
  hidden = withIds(hidden, ids);
  emit();
}

/** Put hidden records back (Undo, a refused delete): their cards swipe back in. */
export function restoreRecords(ids: readonly number[]): void {
  if (ids.length === 0) return;
  hidden = withoutIds(hidden, ids);
  dismissed = withoutIds(dismissed, ids);
  returning = withIds(returning, ids);
  window.setTimeout(() => {
    returning = withoutIds(returning, ids);
    emit();
  }, MARK_TTL_MS);
  emit();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const readServer = () => EMPTY;

/** Records whose card leaves with the swipe. */
export function useDismissedRecords(): IdSet {
  return useSyncExternalStore(subscribe, () => dismissed, readServer);
}

/** Records removed on the client ahead of the server — a feed drops them at its source. */
export function useHiddenRecords(): IdSet {
  return useSyncExternalStore(subscribe, () => hidden, readServer);
}

/** Records put back by an Undo — their card swipes in. */
export function useReturningRecords(): IdSet {
  return useSyncExternalStore(subscribe, () => returning, readServer);
}
