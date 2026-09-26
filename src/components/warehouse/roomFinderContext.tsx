'use client';

/** Shared search-query state for the warehouse sidebar's rooms finder. */

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface RoomFinderContextValue {
  query: string;
  setQuery: (q: string) => void;
}

const RoomFinderContext = createContext<RoomFinderContextValue | null>(null);

function RoomFinderProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('');
  const value = useMemo(() => ({ query, setQuery }), [query]);
  return (
    <RoomFinderContext.Provider value={value}>{children}</RoomFinderContext.Provider>
  );
}

/**
 * Read/write the shared room-search query. Returns a no-op pair when used
 * outside a provider so consumers can render unconditionally.
 */
export function useRoomFinder(): RoomFinderContextValue {
  const ctx = useContext(RoomFinderContext);
  if (!ctx) return { query: '', setQuery: () => {} };
  return ctx;
}
