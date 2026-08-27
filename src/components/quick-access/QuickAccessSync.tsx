'use client';

import { useEffect, useRef } from 'react';
import { useStaffPreferences } from '@/hooks/useStaffPreferences';
import {
  getSettings,
  hydratePinned,
  setPinsPersister,
} from '@/lib/quick-access/storage';

/**
 * Bridges `staff_preferences.prefs.quickAccess` (durable, cross-device) to the
 * Quick Access localStorage cache. Mount once inside the authenticated tree
 * (beside `<ScanHotkeySync/>` / `<TimeFormatSync/>`).
 *
 *   • Hydrates pins from the server when prefs load (server is the SoT).
 *   • If the staffer has never saved pins server-side but has local pins,
 *     seeds the server once (device → account migrate).
 *   • Registers the persister so pin / unpin / rename / reorder PUT back.
 *
 * Renders nothing.
 */
export function QuickAccessSync() {
  const { prefs, update } = useStaffPreferences();
  const seededRef = useRef(false);

  useEffect(() => {
    setPinsPersister((pinned) => update({ quickAccess: { pinned } }));
    return () => setPinsPersister(null);
  }, [update]);

  useEffect(() => {
    if (!prefs || seededRef.current) return;
    seededRef.current = true;

    const serverPinned = prefs.quickAccess?.pinned;
    if (Array.isArray(serverPinned)) {
      hydratePinned(serverPinned);
      return;
    }

    // Never saved server-side — promote local pins so they survive devices.
    const local = getSettings().pinned;
    if (local.length > 0) {
      update({ quickAccess: { pinned: local } });
    }
  }, [prefs, update]);

  return null;
}
