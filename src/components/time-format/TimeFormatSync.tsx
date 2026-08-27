'use client';

import { useEffect, useRef } from 'react';
import { useStaffPreferences } from '@/hooks/useStaffPreferences';
import { hydrateTimeFormat, setTimeFormatPersister } from '@/lib/time-format/store';

/**
 * Bridges the server-backed staff_preferences `timeFormat` to the in-memory
 * time-format store. Mount once inside the authenticated tree (next to
 * <ScanHotkeySync/> / <ThemeSync/>).
 *
 *   • Hydrates the store from the server value once prefs settle (server is
 *     the durable cross-device SoT; the store stayed instant from localStorage).
 *     One-shot — never re-apply on later prefs writes; absent server value
 *     leaves the localStorage cache alone (null must not snap back to 12h).
 *   • Registers the persister so every change PUTs back to the server.
 *
 * Renders nothing.
 */
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
