'use client';

import { useEffect, useRef } from 'react';
import { useStaffPreferences } from '@/hooks/useStaffPreferences';
import { hydrateHotkey, setHotkeyPersister } from '@/lib/scan-hotkey/store';

/**
 * Bridges the server-backed staff_preferences hotkey to the in-memory scan
 * store. Mount once inside the authenticated tree.
 *
 *   • Hydrates the store from the server binding once prefs settle (server is
 *     the durable cross-device SoT; the store stayed instant from localStorage).
 *     One-shot — never re-apply on later prefs writes (same race as KPI collapse).
 *   • Registers the persister so every reassign PUTs back to the server.
 *
 * Renders nothing.
 */
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
