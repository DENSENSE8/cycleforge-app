'use client';

/**
 * Unbox browse primary-paint handoff — lets `ReceivingLinesTable` (and carton
 * overlay) signal that the interactive primary surface is ready so
 * {@link UnboxBrowseShell} can drop the SSR stand-in.
 */

import { createContext, useContext } from 'react';

interface UnboxPrimaryPaintContextValue {
  onPrimaryPainted: () => void;
}

const UnboxPrimaryPaintContext = createContext<UnboxPrimaryPaintContextValue | null>(
  null,
);

export function UnboxPrimaryPaintProvider({
  value,
  children,
}: {
  value: UnboxPrimaryPaintContextValue;
  children: React.ReactNode;
}) {
  return (
    <UnboxPrimaryPaintContext.Provider value={value}>
      {children}
    </UnboxPrimaryPaintContext.Provider>
  );
}

/** Optional — null outside `/unbox` browse shell. */
export function useUnboxPrimaryPaintOptional(): UnboxPrimaryPaintContextValue | null {
  return useContext(UnboxPrimaryPaintContext);
}
