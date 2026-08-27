import type { ReactNode } from 'react';
import { HydrationBoundary, type DehydratedState } from '@tanstack/react-query';

/**
 * Conditionally hydrate the QueryClient ABOVE the app shell.
 *
 * A route whose first-paint content lives in the shell rather than in the page
 * (today: the Unbox recents rail, which `ResponsiveLayout` renders as a sibling
 * of `children`) cannot be seeded from its own page — React renders the sibling
 * first, so the page's `HydrationBoundary` has not run yet. This is the one
 * wrapper allowed to close that gap.
 *
 * `state == null` renders the children untouched, so every other route pays a
 * pass-through component and nothing else. Kept as its own file so the root
 * layout does not grow a conditional tree — mounting `HydrationBoundary` inline
 * would mean duplicating the whole provider nest for the seeded branch.
 */
export function ShellQuerySeed({
  state,
  children,
}: {
  state: DehydratedState | null;
  children: ReactNode;
}) {
  if (!state) return <>{children}</>;
  return <HydrationBoundary state={state}>{children}</HydrationBoundary>;
}
