'use client';

/**
 * The under-title half of slot-column reorder.
 *
 * Headers already report drag/drop keys to DataTable. Compound subtitle
 * facts live inside the item cell, so they cannot use a header handler.
 * DataTable provides this context from the same `onReorderByDrop` the header
 * synthesizes — one write, every family that mounts DataTable + fields.
 *
 * Plan: `docs/todo/subtitle-band-reorder-PLAN.md`.
 */

import { createContext, useContext, type ReactNode } from 'react';

export type SlotLayoutReorderFn = (dragFieldId: string, dropFieldId: string) => void;

const SlotLayoutReorderContext = createContext<SlotLayoutReorderFn | null>(null);

export function SlotLayoutReorderProvider({
  onReorderByDrop,
  children,
}: {
  onReorderByDrop: SlotLayoutReorderFn | null;
  children: ReactNode;
}) {
  return (
    <SlotLayoutReorderContext.Provider value={onReorderByDrop}>
      {children}
    </SlotLayoutReorderContext.Provider>
  );
}

export function useSlotLayoutReorder(): SlotLayoutReorderFn | null {
  return useContext(SlotLayoutReorderContext);
}
