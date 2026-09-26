'use client';

/** `/search` primary-paint handoff — lets whichever body owns the `?sel=` record tell {@link SearchPrimaryPaintShell} that the interactive… */

import { createContext, useContext } from 'react';

interface SearchPrimaryPaintContextValue {
  onPrimaryPainted: () => void;
}

const SearchPrimaryPaintContext = createContext<SearchPrimaryPaintContextValue | null>(
  null,
);

export function SearchPrimaryPaintProvider({
  value,
  children,
}: {
  value: SearchPrimaryPaintContextValue;
  children: React.ReactNode;
}) {
  return (
    <SearchPrimaryPaintContext.Provider value={value}>
      {children}
    </SearchPrimaryPaintContext.Provider>
  );
}

/** Optional — null outside the `/search` shell (e.g. a `⌘K` mount elsewhere). */
export function useSearchPrimaryPaintOptional(): SearchPrimaryPaintContextValue | null {
  return useContext(SearchPrimaryPaintContext);
}
