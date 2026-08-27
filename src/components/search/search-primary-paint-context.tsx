'use client';

/**
 * `/search` primary-paint handoff — lets whichever body owns the `?sel=` record
 * tell {@link SearchPrimaryPaintShell} that the interactive surface is ready,
 * so the shell can drop its loading field.
 *
 * Split from the shell for the same reason `/unbox`'s is: the consumers are
 * deep leaf components, and importing the hook must not drag `UniversalLoader`
 * (a canvas + a rAF loop) into their chunks.
 */

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
