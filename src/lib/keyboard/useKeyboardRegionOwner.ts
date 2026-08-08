'use client';

/**
 * Subscribe to {@link getKeyboardRegionOwner} for paint + key routing.
 */

import { useCallback, useSyncExternalStore } from 'react';
import type { NavRegionId } from '@/lib/keyboard/nav-keys/nav-regions';
import {
  getKeyboardRegionOwner,
  getServerKeyboardRegionOwner,
  setKeyboardRegionOwner,
  subscribeKeyboardRegionOwner,
} from './keyboard-region-owner';

export function useKeyboardRegionOwner(): {
  owner: NavRegionId | null;
  claim: (id: NavRegionId) => void;
  isOwner: (id: NavRegionId) => boolean;
} {
  const owner = useSyncExternalStore(
    subscribeKeyboardRegionOwner,
    getKeyboardRegionOwner,
    getServerKeyboardRegionOwner,
  );
  const claim = useCallback((id: NavRegionId) => {
    setKeyboardRegionOwner(id);
  }, []);
  const isOwner = useCallback((id: NavRegionId) => owner === id, [owner]);
  return { owner, claim, isOwner };
}
