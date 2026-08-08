'use client';

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import type { StaffPreferences } from '@/lib/neon/staff-preferences-queries';
import type { StaffPreferencesPutBody } from '@/lib/schemas/staff-preferences';

export const STAFF_PREFERENCES_QUERY_KEY = ['staff-preferences'] as const;
const QUERY_KEY = STAFF_PREFERENCES_QUERY_KEY;

/**
 * Apply only the keys present in `patch`, reading confirmed values from the
 * server `prefs` response. A full `setQueryData(serverPrefs)` clobbers nested
 * maps (kpiCollapsed · tableColumns · …) that a concurrent writer already
 * painted optimistically — that was the Unbox Hide/Show metrics flash.
 */
function mergePatchedPrefs(
  current: StaffPreferences | undefined,
  patch: StaffPreferencesPutBody,
  serverPrefs: StaffPreferences,
): StaffPreferences {
  const next: StaffPreferences = { ...(current ?? {}) };
  for (const key of Object.keys(patch) as Array<keyof StaffPreferencesPutBody>) {
    if (patch[key] === undefined) continue;
    (next as Record<string, unknown>)[key as string] = serverPrefs[key as keyof StaffPreferences];
  }
  return next;
}

/**
 * The logged-in staffer's UI preferences (server-backed, cross-device).
 *
 * Gated on an authenticated session so it never fires on public pages. The
 * focus-scan hotkey rides on this; see {@link useScanHotkey} for the live
 * binding (which hydrates from here but stays instant via localStorage).
 */
export function useStaffPreferences() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const enabled = !!user?.staffId;

  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<StaffPreferences> => {
      const res = await fetch('/api/staff-preferences');
      if (!res.ok) throw new Error(`staff-preferences ${res.status}`);
      const data = (await res.json()) as { prefs: StaffPreferences };
      return data.prefs ?? {};
    },
  });

  const mutation = useMutation({
    mutationFn: async (patch: StaffPreferencesPutBody): Promise<StaffPreferences> => {
      const res = await fetch('/api/staff-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`staff-preferences PUT ${res.status}`);
      const data = (await res.json()) as { prefs: StaffPreferences };
      return data.prefs ?? {};
    },
    onSuccess: (serverPrefs, patch) => {
      queryClient.setQueryData<StaffPreferences>(QUERY_KEY, (current) =>
        mergePatchedPrefs(current, patch, serverPrefs),
      );
    },
  });

  const update = useCallback(
    (patch: StaffPreferencesPutBody) => mutation.mutate(patch),
    [mutation],
  );

  return {
    prefs: query.data,
    isLoading: query.isLoading,
    update,
  };
}
