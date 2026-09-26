'use client';

import type { ReactNode } from 'react';
import { AblyProvider } from '@/contexts/AblyContext';
import {
  useKioskSharedSession,
  type KioskSharedSessionState,
} from '@/lib/kiosk/useKioskSharedSession';

/** Realtime for a DEVICE principal. */
export function KioskRealtimeProvider({ children }: { children: ReactNode }) {
  return (
    <AblyProvider authUrl="/api/realtime/kiosk-token">
      <KioskSharedSessionMount />
      {children}
    </AblyProvider>
  );
}

/** Renders nothing; exists so the mirror runs INSIDE the provider. */
function KioskSharedSessionMount() {
  const state: KioskSharedSessionState = useKioskSharedSession();
  // Exposed for debugging a live counter without opening the network tab:
  // `document.body.dataset.kioskSession` reads "42:live" / "none:polling".
  if (typeof document !== 'undefined') {
    document.body.dataset.kioskSession =
      `${state.sessionId ?? 'none'}:${state.live ? 'live' : 'polling'}`;
  }
  return null;
}
