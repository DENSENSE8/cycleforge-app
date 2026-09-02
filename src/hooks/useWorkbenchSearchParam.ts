'use client';

import { useCallback, useState } from 'react';

/**
 * Path-agnostic local state for a workbench header search field.
 *
 * The one scoped-search waist for workbench pages that don't need the
 * dashboard's extra behavior (openOrderId reset, forced `/dashboard` target).
 * Search must not call `router.replace` on each keystroke: that triggers a soft
 * navigation/remount and clears the controlled field. The raw value is kept so
 * spaces and partial input remain visible while consumers trim at their data
 * boundary.
 *
 * The dashboard keeps `useDashboardSearchController` for its richer semantics.
 */
export function useWorkbenchSearchParam() {
  const [searchQuery, setSearchQuery] = useState('');
  const setSearch = useCallback((next: string) => setSearchQuery(next), []);

  return { searchQuery, setSearch };
}
