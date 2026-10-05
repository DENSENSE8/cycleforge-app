'use client';

/**
 * The staffer's FNSKU quantity scale — 20, 30 or 99 — kept per person,
 * cross-device, in `staff_preferences.prefs.fnskuCopyRange`, through the same
 * `useStaffPreferences` path as `useTriageDensity` (the root layout seeds the
 * prefs query, so server and client renders agree).
 */

import { useCallback, useState } from 'react';
import { useStaffPreferences } from '@/hooks/useStaffPreferences';
import { DEFAULT_FNSKU_COPY_RANGE, isFnskuCopyRange, type FnskuCopyRange } from '@/lib/print/labelCopies';

export function useFnskuCopyRange(): readonly [FnskuCopyRange, (range: FnskuCopyRange) => void] {
  const { prefs, update } = useStaffPreferences();
  // The press paints at once; the server's answer confirms it.
  const [pressed, setPressed] = useState<FnskuCopyRange | null>(null);
  const saved = prefs?.fnskuCopyRange;
  const range = pressed ?? (isFnskuCopyRange(saved) ? saved : DEFAULT_FNSKU_COPY_RANGE);
  const setRange = useCallback(
    (next: FnskuCopyRange) => {
      setPressed(next);
      update({ fnskuCopyRange: next });
    },
    [update],
  );
  return [range, setRange] as const;
}
