'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface MobileV2SearchValue {
  isOpen: boolean;
  query: string;
  openSearch: () => void;
  closeSearch: () => void;
  setQuery: (query: string) => void;
}

const MobileV2SearchContext = createContext<MobileV2SearchValue | null>(null);
const SEARCH_STATE_KEY = 'cycleforge:mobile-v2:search-state';

function readSearchState(): { isOpen: boolean; query: string } {
  if (typeof window === 'undefined') return { isOpen: false, query: '' };
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(SEARCH_STATE_KEY) || '{}') as { isOpen?: unknown; query?: unknown };
    const query = typeof raw.query === 'string' ? raw.query : '';
    return { isOpen: raw.isOpen === true && Boolean(query), query };
  } catch {
    return { isOpen: false, query: '' };
  }
}

/** Shell-owned contextual find: pages own results, while chrome owns entry and focus. */
export function MobileV2SearchProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(readSearchState);
  const [isOpen, setIsOpen] = useState(initial.isOpen);
  const [query, setQuery] = useState(initial.query);

  const openSearch = useCallback(() => setIsOpen(true), []);
  const closeSearch = useCallback(() => {
    setIsOpen(false);
    setQuery('');
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem(SEARCH_STATE_KEY, JSON.stringify({ isOpen, query }));
  }, [isOpen, query]);

  const value = useMemo(
    () => ({ isOpen, query, openSearch, closeSearch, setQuery }),
    [closeSearch, isOpen, openSearch, query],
  );

  return <MobileV2SearchContext.Provider value={value}>{children}</MobileV2SearchContext.Provider>;
}

export function useMobileV2Search(): MobileV2SearchValue {
  const value = useContext(MobileV2SearchContext);
  if (!value) throw new Error('useMobileV2Search must be used inside MobileV2SearchProvider');
  return value;
}
