import type { ReactNode } from 'react';
import { HydrationBoundary, type DehydratedState } from '@tanstack/react-query';

/** Conditionally hydrate the QueryClient ABOVE the app shell. */
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
