'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  getNavIntentsVersion,
  hasNavIntent,
  registerNavIntent,
  subscribeNavIntents,
} from './intents';

/**
 * Own a sidebar action intent while this component is mounted. Pass `null` to
 * withhold it (the sidebar paints the action disabled). The latest `handler`
 * always runs; its identity does not re-register.
 */
export function useNavIntent(intent: string, handler: (() => void) | null): void {
  const ref = useRef(handler);
  ref.current = handler;
  const enabled = handler !== null;
  useEffect(() => {
    if (!enabled) return undefined;
    return registerNavIntent(intent, () => ref.current?.());
  }, [intent, enabled]);
}

/** Re-renders when the registered set changes; `true` when `intent` has an owner. */
export function useNavIntentAvailable(intent: string | undefined): boolean {
  useSyncExternalStore(subscribeNavIntents, getNavIntentsVersion, () => 0);
  return intent !== undefined && hasNavIntent(intent);
}
