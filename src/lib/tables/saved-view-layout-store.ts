'use client';

/** The saved view's LAYOUT half — the channel that makes `savedViewLayout` real. */

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

/** Publish the active view's layout for `tableId`, or `null` when no view is applied (or the applied view predates layout capture). */
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
