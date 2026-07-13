'use client';

import { useEffect } from 'react';
import { useStaffPreferences } from '@/hooks/useStaffPreferences';
import { hydrateTimeFormat, setTimeFormatPersister } from '@/lib/time-format/store';

/**
 * Bridges the server-backed staff_preferences `timeFormat` to the in-memory
 * time-format store. Mount once inside the authenticated tree (next to
 * <ScanHotkeySync/> / <ThemeSync/>).
 *
 *   • Hydrates the store from the server value when it loads (server is the
 *     durable cross-device SoT; the store stayed instant from localStorage).
 *   • Registers the persister so every change PUTs back to the server.
 *
 * Renders nothing.
 */
export function TimeFormatSync() {
  const { prefs, update } = useStaffPreferences();

  // Persist changes to the server. update is stable (useCallback).
  useEffect(() => {
    setTimeFormatPersister((value) => update({ timeFormat: value }));
    return () => setTimeFormatPersister(null);
  }, [update]);

  // Adopt the server value once it arrives.
  useEffect(() => {
    hydrateTimeFormat(prefs?.timeFormat ?? null);
  }, [prefs?.timeFormat]);

  return null;
}
