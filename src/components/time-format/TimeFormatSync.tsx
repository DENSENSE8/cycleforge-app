'use client';

import { useEffect, useRef } from 'react';
import { useStaffPreferences } from '@/hooks/useStaffPreferences';
import { hydrateTimeFormat, setTimeFormatPersister } from '@/lib/time-format/store';

/** Bridges the server-backed staff_preferences `timeFormat` to the in-memory time-format store. */
export function TimeFormatSync() {
  const { prefs, update } = useStaffPreferences();
  const hydratedRef = useRef(false);

  // Persist changes to the server. update is stable (useCallback).
  useEffect(() => {
    setTimeFormatPersister((value) => update({ timeFormat: value }));
    return () => setTimeFormatPersister(null);
  }, [update]);

  // Adopt the server value once — only when the server sent an explicit format.
  useEffect(() => {
    if (!prefs || hydratedRef.current) return;
    hydratedRef.current = true;
    if (prefs.timeFormat) hydrateTimeFormat(prefs.timeFormat);
  }, [prefs]);

  return null;
}
