'use client';

/** The under-title half of slot-column reorder. */

import { createContext, useContext, type ReactNode } from 'react';

type SlotLayoutReorderFn = (dragFieldId: string, dropFieldId: string) => void;

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
