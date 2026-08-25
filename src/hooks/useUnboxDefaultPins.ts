'use client';

import { skipToken, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  UNBOX_DEFAULT_PINS_QUERY_KEY,
  useStaffPreferences,
} from '@/hooks/useStaffPreferences';
import {
  sanitizeUnboxPinnedExtraTabs,
  type UnboxExtraTabId,
} from '@/lib/receiving/unbox-extra-tabs';

/**
 * The effective NON-STAFF default for the Unbox Band-1 Inbound pin — role → org
 * → [] — resolved server-side by `/api/staff-preferences` GET. The chrome layers
 * the staffer's own `unboxPinnedExtraTabs` on top via `resolveUnboxPinnedTabs`,
 * so a fresh staffer inherits the org/role template without a personal pin click
 * (Gemini D9).
 *
 * Keeps its OWN cache entry — the shared `STAFF_PREFERENCES_QUERY_KEY` value is
 * read/written directly as raw `StaffPreferences` by many surfaces
 * (TableColumnConfigProvider, useGridColumnVisibility, …), so widening its shape
 * is unsafe — but it no longer costs its own REQUEST. `useStaffPreferences`
 * parks `unboxDefaultPins` from the same response into
 * {@link UNBOX_DEFAULT_PINS_QUERY_KEY}; this hook mounts that query to schedule
 * the one shared fetch, then observes the side-car with `skipToken` so it never
 * issues a second GET of a body it already has.
 *
 * No side-car (fetch failed, or the entry was evicted) resolves to `[]`, which
 * is what a failed fetch already did.
 */
export function useUnboxDefaultPins(): UnboxExtraTabId[] {
  const { user } = useAuth();
  // Mount the shared preferences query — this is what schedules the single
  // `/api/staff-preferences` GET whose response fills the side-car below.
  useStaffPreferences();
  const { data } = useQuery<string[]>({
    queryKey: UNBOX_DEFAULT_PINS_QUERY_KEY,
    queryFn: skipToken,
    enabled: !!user?.staffId,
    staleTime: 10 * 60 * 1000,
  });
  return sanitizeUnboxPinnedExtraTabs(data);
}
