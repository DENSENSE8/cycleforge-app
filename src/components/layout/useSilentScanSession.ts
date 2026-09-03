'use client';

/**
 * Silent scan session — header MRU companion for in-progress scan surfaces.
 *
 * Stubbed safe defaults: Pack (and other desks) must render even when no scan
 * session is active. A fuller persistence layer can replace this later without
 * changing the `{ session, recent, loadRecent }` face.
 */

import { useCallback, useState } from 'react';

export type SilentScanSession = {
  id: string;
  surfaceKey?: string | null;
  scanType?: string | null;
} | null;

export type SilentScanRecentRow = {
  id: string;
  surfaceKey?: string | null;
  scanType?: string | null;
};

export function useSilentScanSession(): {
  session: SilentScanSession;
  recent: SilentScanRecentRow[];
  loadRecent: () => Promise<void>;
} {
  const [session] = useState<SilentScanSession>(null);
  const [recent] = useState<SilentScanRecentRow[]>([]);
  const loadRecent = useCallback(async () => {
    /* no-op stub — no persisted silent-scan sessions yet */
  }, []);
  return { session, recent, loadRecent };
}
