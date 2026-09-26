'use client';

import { useCallback, useState } from 'react';

/** Path-agnostic local state for a workbench header search field. */
export function useWorkbenchSearchParam() {
  const [searchQuery, setSearchQuery] = useState('');
  const setSearch = useCallback((next: string) => setSearchQuery(next), []);

  return { searchQuery, setSearch };
}
