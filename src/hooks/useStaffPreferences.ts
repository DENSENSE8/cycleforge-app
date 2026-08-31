'use client';

import { useCallback, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import type { StaffPreferences } from '@/lib/neon/staff-preferences-queries';
import type { StaffPreferencesPutBody } from '@/lib/schemas/staff-preferences';

export const STAFF_PREFERENCES_QUERY_KEY = ['staff-preferences'] as const;
const QUERY_KEY = STAFF_PREFERENCES_QUERY_KEY;

/**
 * Side-car for the sibling field on the SAME `/api/staff-preferences` response
 * that {@link STAFF_PREFERENCES_QUERY_KEY} throws away.
 *
 * `useUnboxDefaultPins` used to fetch the identical response a second time
 * under its own key — measured on cold `/unbox`, two GETs of the same 1943-byte
 * body, 4.7s apart, plus one more of each on every window-focus refetch. It
 * cannot simply read the main cache: that entry is `setQueryData`-written as
 * raw `StaffPreferences` by seven surfaces (column widths / visibility / display,
 * row fills, KPI collapse, TableColumnConfig), so widening its VALUE is unsafe.
 * Writing the sibling field to its own key keeps both shapes exactly as they
 * were and still costs one request.
 *
 * The reader observes this key with `skipToken`, so it never fetches on its own.
 * If the entry is absent it resolves to `[]` — which is already the defined
 * behaviour when the fetch fails, so the degradation is not new.
 */
export const UNBOX_DEFAULT_PINS_QUERY_KEY = ['staff-preferences', 'unbox-default-pins'] as const;

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
  let changed = false;
  for (const key of Object.keys(patch) as Array<keyof StaffPreferencesPutBody>) {
    if (patch[key] === undefined) continue;
    const incoming = serverPrefs[key as keyof StaffPreferences];
    if (!sameJson(current?.[key as keyof StaffPreferences], incoming)) changed = true;
    (next as Record<string, unknown>)[key as string] = incoming;
  }
  /*
   * Identity is load-bearing, so confirming a value must not mint a new object.
   *
   * This returned `{...current}` unconditionally, which meant every successful
   * PUT handed React Query a fresh prefs identity even when the server merely
   * echoed what the optimistic write had already painted. Downstream, the table
   * layout memos are keyed on that identity — `staffLayoutsRaw` →
   * `staffLayout` → `effectiveLayout` → the materialized column model — so a
   * single column toggle rebuilt the entire grid TWICE: once instantly, then
   * again one round trip later. The second rebuild is the flash the operator
   * sees, and it always arrives after they have moved on.
   *
   * Unchanged in ⇒ unchanged out.
   */
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
      /*
       * Drop a superseded response.
       *
       * There is no mutation scope here, so two quick column toggles issue two
       * overlapping PUTs. Whichever RESPONSE arrives last used to win, and the
       * first request carries a prefs body that is one edit stale — so a fast
       * second click could snap the layout back a step. Only the newest write
       * is allowed to confirm.
       */
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
