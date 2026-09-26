'use client';

import { useEffect, useRef } from 'react';
import { useStaffPreferences } from '@/hooks/useStaffPreferences';
import { hydrateHotkey, setHotkeyPersister } from '@/lib/scan-hotkey/store';

/** Bridges the server-backed staff_preferences hotkey to the in-memory scan store. */
export function ScanHotkeySync() {
  const { prefs, update } = useStaffPreferences();
  const hydratedRef = useRef(false);

  // Persist reassigns to the server. update is stable (useCallback).
  useEffect(() => {
    setHotkeyPersister((key) => update({ focusScanHotkey: key }));
    return () => setHotkeyPersister(null);
  }, [update]);

  // Adopt the server value once — local store owns paint after that.
  useEffect(() => {
    if (!prefs || hydratedRef.current) return;
    hydratedRef.current = true;
    hydrateHotkey(prefs.focusScanHotkey ?? null);
  }, [prefs]);

  return null;
}
