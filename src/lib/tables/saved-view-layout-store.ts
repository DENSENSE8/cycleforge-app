'use client';

/**
 * The saved view's LAYOUT half — the channel that makes `savedViewLayout` real.
 *
 * `resolveEffectiveLayout` has always read
 * `savedViewLayout ?? staffLayout ?? orgLayout ?? productDefault`, and the first
 * term was declared, typed, and **passed by no caller** — so columns were the
 * one part of a view that did not survive it. Everything else already did: a
 * view stores the encoded values of every `paramKey`, so search, filters, sort,
 * date range and tab round-trip through the URL. A layout cannot ride there —
 * it is a document, not a param — so it rides in the view record's `filters`
 * blob and reaches the table through this store.
 *
 * ## Why a module store and not a prop
 *
 * The page calls `use*TableLayout` and passes the result DOWN into `DataTable`,
 * which is what mounts the views menu. So the component that knows which view is
 * active sits BELOW the hook that needs the answer. Same inversion, and the same
 * fix, as `rail-actions-store`: a module-level subscribe/emit with a cached
 * snapshot for `useSyncExternalStore`.
 *
 * The cost is one extra frame when a view is applied — the menu publishes in an
 * effect, the page re-renders next tick. Applying a view is a deliberate act,
 * not a hot path; the alternative is threading a layout through every desk that
 * mounts a table.
 *
 * Keyed by `tableId` (the `PRODUCT_TABLES` key), not by the view's `surface`:
 * the layout cascade speaks tableIds, and translating vocabularies at a store
 * boundary is how the two would drift.
 */

import type { SlotLayout } from '@/lib/tables/slot-layout-core';

const layouts = new Map<string, SlotLayout | null>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeSavedViewLayout(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSavedViewLayout(tableId: string): SlotLayout | null {
  return layouts.get(tableId) ?? null;
}

/** SSR / first paint — no view has been applied yet. */
export function getServerSavedViewLayout(): SlotLayout | null {
  return null;
}

/**
 * Publish the active view's layout for `tableId`, or `null` when no view is
 * applied (or the applied view predates layout capture).
 *
 * Identity-stable when nothing changed: consumers re-render on every
 * notification, and the menu publishes from an effect that runs on each URL
 * change, so an always-emit would re-render every mounted table on every
 * keystroke in the search field.
 */
export function setSavedViewLayout(tableId: string, layout: SlotLayout | null): void {
  const prev = layouts.get(tableId) ?? null;
  if (prev === layout) return;
  layouts.set(tableId, layout);
  emit();
}

/** Drop a table's entry — the views menu unmounting. */
export function clearSavedViewLayout(tableId: string): void {
  if (!layouts.has(tableId)) return;
  layouts.delete(tableId);
  emit();
}
