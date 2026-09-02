'use client';

/**
 * Silent scan-session face for Recents. Duration never paints here.
 * Empty until the recorder client is mounted; Recents still uses MasterNav.
 */

import { useCallback, useState } from 'react';

export type SilentScanSessionFace = {
  id: number;
  surfaceKey: string | null;
  scanType: string | null;
};

export function useSilentScanSession() {
  const [session] = useState<SilentScanSessionFace | null>(null);
  const [recent] = useState<SilentScanSessionFace[]>([]);

  const loadRecent = useCallback(async () => {
    /* Recents face is MasterNav identity; list fetch is optional. */
  }, []);

  return { session, recent, loadRecent };
}
