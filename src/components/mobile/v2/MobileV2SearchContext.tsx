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
import { useLocalBulkList, type BulkList } from '@/lib/nav/locate/use-bulk-list';

interface MobileV2SearchValue {
  isOpen: boolean;
  query: string;
  /** A paste of 2+ numbers into the field: where each one lives (`GET /api/nav/locate`, every locator). */
  pasteList: BulkList;
  openSearch: () => void;
  /** Closes the field — the query and the pasted list go with it. */
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

/**
 * Shell-owned contextual find: pages own results, while chrome owns entry and
 * focus. The pasted list lives here, not in the bar, so it survives the bar
 * unmounting while a row's record is open.
 */
export function MobileV2SearchProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(readSearchState);
  const [isOpen, setIsOpen] = useState(initial.isOpen);
  const [query, setQuery] = useState(initial.query);
  const pasteList = useLocalBulkList('everywhere');
  const clearPasteList = pasteList.clear;

  const openSearch = useCallback(() => setIsOpen(true), []);
  const closeSearch = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    clearPasteList();
  }, [clearPasteList]);

  useEffect(() => {
    window.sessionStorage.setItem(SEARCH_STATE_KEY, JSON.stringify({ isOpen, query }));
  }, [isOpen, query]);

  const value = useMemo(
    () => ({ isOpen, query, pasteList, openSearch, closeSearch, setQuery }),
    [closeSearch, isOpen, openSearch, pasteList, query],
  );

  return <MobileV2SearchContext.Provider value={value}>{children}</MobileV2SearchContext.Provider>;
}

export function useMobileV2Search(): MobileV2SearchValue {
  const value = useContext(MobileV2SearchContext);
  if (!value) throw new Error('useMobileV2Search must be used inside MobileV2SearchProvider');
  return value;
}
