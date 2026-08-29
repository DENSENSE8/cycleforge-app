'use client';

/**
 * Home → Daily Band 3 find — Unbox History chrome find field.
 *
 * Dominant {@link TechRailSearchBar} (`variant="chrome"`). Status lives on the
 * Band 1 Completed tab, not a second in-field facet.
 */

import { SearchField } from '@/design-system/primitives/SearchField';

export function DailyTriageSearch({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (next: string) => void;
}) {
  return (
    <SearchField
      value={query}
      onChange={onQueryChange}
      placeholder="Filter checks…"
      className="min-w-0 flex-1"
        />
  );
}
