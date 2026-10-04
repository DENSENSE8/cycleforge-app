/**
 * Shell-level seed of the signed-in staffer's preferences (`useStaffPreferences`),
 * hydrated ABOVE every route so the server render and the first client render
 * read the same prefs. Without it the server paints the defaults and the
 * client — whose prefs fetch can land before a deferred Suspense boundary
 * hydrates — paints the saved choice: a hydration mismatch (the Compact/Full
 * triage density on /fulfilled) and, at best, a swap after paint (saved
 * column widths on /pick — the CLS).
 */
import 'server-only';
import { dehydrate, QueryClient, type DehydratedState } from '@tanstack/react-query';
import { isNextDynamicUsage } from '@/lib/kiosk/next-dynamic-usage';
import { getStaffPreferences } from '@/lib/neon/staff-preferences-queries';
import type { OrgId } from '@/lib/tenancy/constants';

/** Mirrors `STAFF_PREFERENCES_QUERY_KEY` (a client module — its value cannot cross into RSC). */
const STAFF_PREFERENCES_KEY = ['staff-preferences'] as const;

export async function seedStaffPreferences(user: {
  staffId: number;
  organizationId: string;
}): Promise<DehydratedState | null> {
  try {
    const prefs = await getStaffPreferences(user.staffId, user.organizationId as OrgId);
    const queryClient = new QueryClient();
    queryClient.setQueryData(STAFF_PREFERENCES_KEY, prefs);
    return dehydrate(queryClient);
  } catch (error) {
    if (isNextDynamicUsage(error)) throw error;
    console.error('seedStaffPreferences failed; client will fetch', error);
    return null;
  }
}

/** One shell seed from the route's station seed and the prefs seed. */
export function mergeShellSeeds(
  station: DehydratedState | null,
  prefs: DehydratedState | null,
): DehydratedState | null {
  if (!station) return prefs;
  if (!prefs) return station;
  return {
    mutations: [...station.mutations, ...prefs.mutations],
    queries: [...station.queries, ...prefs.queries],
  };
}
