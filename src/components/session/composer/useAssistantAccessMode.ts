'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { AssistantAccessMode } from '@/lib/assistant/access-mode';

/**
 * The composer's access mode, remembered per staffer on this device. The
 * server enforces it (`accessMode` in the chat body → dispatch gate); this is
 * only the operator's standing choice.
 */
export function useAssistantAccessMode(): [AssistantAccessMode, (next: AssistantAccessMode) => void] {
  const { user } = useAuth();
  const key = `cf.ai.accessMode.${user?.staffId ?? 'anon'}`;
  // Full until storage is read: the first paint must match the server render.
  const [mode, setMode] = useState<AssistantAccessMode>('full');

  useEffect(() => {
    try {
      setMode(window.localStorage.getItem(key) === 'ask' ? 'ask' : 'full');
    } catch {
      /* storage blocked — stay on full */
    }
  }, [key]);

  const choose = useCallback(
    (next: AssistantAccessMode) => {
      setMode(next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        /* storage blocked — the choice lasts this page only */
      }
    },
    [key],
  );

  return [mode, choose];
}
