'use client';

import type { ReactNode } from 'react';
import { AblyProvider } from '@/contexts/AblyContext';
import {
  useKioskSharedSession,
  type KioskSharedSessionState,
} from '@/lib/kiosk/useKioskSharedSession';

/**
 * Realtime for a DEVICE principal.
 *
 * The app-wide `AuthenticatedAblyProvider` mounts nothing here on purpose: it
 * gates on a staff `user`, and a tablet has none. So the kiosk mounts its own
 * client pointed at `/api/realtime/kiosk-token`, whose grant is exactly one
 * channel — this device's bridge.
 *
 * Nesting a second provider under the app-wide one is fine and intended: the
 * context is React-scoped, so kiosk children resolve to the device client while
 * every staff surface keeps the shared staff connection.
 *
 * Plan: `docs/todo/kiosk-desk-session-channel-PLAN.md` (P4b · P3).
 */
export function KioskRealtimeProvider({ children }: { children: ReactNode }) {
  return (
    <AblyProvider authUrl="/api/realtime/kiosk-token">
      <KioskSharedSessionMount />
      {children}
    </AblyProvider>
  );
}

/**
 * Renders nothing; exists so the mirror runs INSIDE the provider.
 *
 * `useKioskSharedSession` needs the device Ably client, and a hook cannot reach
 * a provider its own component mounts — so the subscription lives one level
 * down rather than being lifted into `KioskRealtimeProvider` itself.
 */
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
