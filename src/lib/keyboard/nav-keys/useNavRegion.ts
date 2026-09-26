'use client';

/** `useNavRegion` — a region opts into the leader-armed selection keyboard. */

import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { NavMode } from './nav-leader-machine';
import type { NavRegionId } from './nav-regions';
import { resolveNavKeymap } from './resolveNavKeymap';
import {
  getNavMode,
  getServerNavMode,
  registerNavRegion,
  subscribeNavMode,
} from './nav-leader-store';

/** Subscribe to the global nav mode (idle / pick / armed). */
function useNavMode(): NavMode {
  return useSyncExternalStore(subscribeNavMode, getNavMode, getServerNavMode);
}

interface UseNavRegionArgs {
  /** Region to register, or null/undefined to opt OUT (inert — no keycaps, no key capture). */
  id: NavRegionId | null | undefined;
  /** Ordered targets — `{ id, preferredKey? }`; recent-data rows omit the key. */
  targets: readonly { id: string; preferredKey?: string | null }[];
  onCommit: (targetId: string) => void;
}

export function useNavRegion({ id, targets, onCommit }: UseNavRegionArgs): {
  armed: boolean;
  keymap: Map<string, string>;
} {
  const keymap = useMemo(
    () => (id ? resolveNavKeymap(targets) : new Map<string, string>()),
    [id, targets],
  );

  // The store reads these at keystroke time (out of render), so keep them fresh
  // without re-registering the handle on every targets change.
  const keymapRef = useRef(keymap);
  keymapRef.current = keymap;
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  useEffect(() => {
    if (!id) return;
    return registerNavRegion({
      id,
      getKeymap: () => keymapRef.current,
      commit: (targetId) => commitRef.current(targetId),
    });
  }, [id]);

  const mode = useNavMode();
  const armed = id != null && mode.phase === 'armed' && mode.region === id;
  return { armed, keymap };
}
