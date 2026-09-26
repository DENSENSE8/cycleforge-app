'use client';

import { useCallback, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import type { StaffPreferences } from '@/lib/neon/staff-preferences-queries';
import type { StaffPreferencesPutBody } from '@/lib/schemas/staff-preferences';

export const STAFF_PREFERENCES_QUERY_KEY = ['staff-preferences'] as const;
const QUERY_KEY = STAFF_PREFERENCES_QUERY_KEY;

/** Side-car for the sibling field on the SAME `/api/staff-preferences` response that {@link STAFF_PREFERENCES_QUERY_KEY} throws away. */
export const UNBOX_DEFAULT_PINS_QUERY_KEY = ['staff-preferences', 'unbox-default-pins'] as const;

/** Apply only the keys present in `patch`, reading confirmed values from the server `prefs` response. */
function mergePatchedPrefs(
  current: StaffPreferences | undefined,
  patch: StaffPreferencesPutBody,
  serverPrefs: StaffPreferences,
): StaffPreferences {
  const next: StaffPreferences = { ...(current ?? {}) };
  let changed = false;
  for (const key of Object.keys(patch) as Array<keyof StaffPreferencesPutBody>) {
    if (patch[key] === undefined) continue;
    const incoming = serverPrefs[key as keyof StaffPreferences];
    if (!sameJson(current?.[key as keyof StaffPreferences], incoming)) changed = true;
    (next as Record<string, unknown>)[key as string] = incoming;
  }
  /* Identity is load-bearing, so confirming a value must not mint a new object. */
  return changed ? next : (current ?? next);
}

/** Structural equality for plain JSON prefs values (no cycles, API-shaped). */
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/** The logged-in staffer's UI preferences (server-backed, cross-device). */
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
      const data = (await res.json()) as {
        prefs: StaffPreferences;
        unboxDefaultPins?: string[];
      };
      // Park the sibling field so `useUnboxDefaultPins` reads it instead of
      // re-fetching this exact response. See UNBOX_DEFAULT_PINS_QUERY_KEY.
      queryClient.setQueryData<string[]>(
        UNBOX_DEFAULT_PINS_QUERY_KEY,
        data.unboxDefaultPins ?? [],
      );
      return data.prefs ?? {};
    },
  });

  // Monotonic write sequence — see onSuccess.
  const pendingSeq = useRef(0);

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
    onMutate: () => {
      // Sequence every write so a slower earlier PUT cannot land last.
      pendingSeq.current += 1;
      return { seq: pendingSeq.current };
    },
    onSuccess: (serverPrefs, patch, context) => {
      /* Drop a superseded response. */
      if (context && context.seq !== pendingSeq.current) return;
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
