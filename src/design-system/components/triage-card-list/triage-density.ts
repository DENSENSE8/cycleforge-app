'use client';

/**
 * The operator's own triage density per surface — Compact (`row`) or Full
 * (`card`), kept per person, cross-device, in
 * `staff_preferences.prefs.triageDensity[surfaceKey]`. The face never picks a
 * density on its own (`pinned.json` TriageCardList): a host that offers the
 * choice passes this pair as `densityControl`.
 *
 * Hydration: the saved choice must be known to the SERVER render too, or the
 * server paints the fallback face while the client — whose prefs fetch can
 * land before a deferred boundary hydrates — paints the saved one ("Hydration
 * failed", empty list). The root layout seeds `['staff-preferences']` above
 * the shell (`staff-preferences-seed.server.ts`), so both renders read it.
 */

import { useCallback, useState } from 'react';
import { useStaffPreferences } from '@/hooks/useStaffPreferences';

export type TriageDensity = 'card' | 'row';

/** The surfaces that offer the switch — one prefs key each. */
export type TriageDensitySurface =
  | 'outbound.allocate'
  | 'outbound.fulfilled'
  | 'incoming.pasted'
  | 'inventory.stock'
  | 'incoming.pipeline'
  | 'imports.runs'
  | 'repair.queue'
  | 'exceptions.list';

export function useTriageDensity(
  surfaceKey: TriageDensitySurface,
  fallback: TriageDensity = 'card',
): readonly [TriageDensity, (density: TriageDensity) => void] {
  const { prefs, update } = useStaffPreferences();
  // The press paints at once; the server's answer confirms it.
  const [pressed, setPressed] = useState<TriageDensity | null>(null);
  const saved = prefs?.triageDensity?.[surfaceKey];
  const density = pressed ?? saved ?? fallback;
  const setDensity = useCallback(
    (next: TriageDensity) => {
      setPressed(next);
      // Send only this surface: the server merges `triageDensity` per key, so a
      // stale copy of the map in this tab can never overwrite another surface.
      update({ triageDensity: { [surfaceKey]: next } });
    },
    [surfaceKey, update],
  );
  return [density, setDensity] as const;
}
