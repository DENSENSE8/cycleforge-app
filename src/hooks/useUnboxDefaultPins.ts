'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
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
 * Deliberately its OWN query key — the shared `STAFF_PREFERENCES_QUERY_KEY` cache
 * is read/written directly as raw `StaffPreferences` by many surfaces
 * (TableColumnConfigProvider, useGridColumnVisibility, …), so widening its shape
 * is unsafe. Long staleTime + auth-gated ⇒ effectively one fetch per session.
 */
export function useUnboxDefaultPins(): UnboxExtraTabId[] {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['unbox-default-pins'],
    enabled: !!user?.staffId,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<UnboxExtraTabId[]> => {
      const res = await fetch('/api/staff-preferences');
      if (!res.ok) return [];
      const data = (await res.json()) as { unboxDefaultPins?: string[] };
      return sanitizeUnboxPinnedExtraTabs(data.unboxDefaultPins);
    },
  });
  return query.data ?? [];
}
