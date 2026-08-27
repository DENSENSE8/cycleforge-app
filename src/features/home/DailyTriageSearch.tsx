'use client';

/**
 * Home → Daily Band 3 find — Unbox History chrome find field.
 *
 * Dominant {@link TechRailSearchBar} (`variant="chrome"`). Status lives on the
 * Band 1 Completed tab, not a second in-field facet.
 */

import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';

export function DailyTriageSearch({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (next: string) => void;
}) {
  return (
    <TechRailSearchBar
      variant="chrome"
      value={query}
      onChange={onQueryChange}
      placeholder="Filter checks…"
      className="min-w-0 flex-1"
    />
  );
}
