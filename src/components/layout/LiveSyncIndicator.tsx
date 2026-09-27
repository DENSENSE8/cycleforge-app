'use client';

/**
 * Live sync health in the app top bar — "Live" / "Sync paused" — on routes
 * whose live layer the shell mounts (`realtime-registry.ts`). One component,
 * two looks: the region's mode draws it (triage: pill, sentence case;
 * industrial: square tile, mono caps — `rounded-mode-pill` + `.mode-label`).
 */

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { ChromeModeRegion } from '@/design-system/providers/RouteModeRegion';
import { useRealtimeLink } from '@/hooks/useConnectionHealth';
import { REALTIME_DEGRADED_LABEL } from '@/lib/realtime/connection-health';
import { realtimeRouteFor } from '@/lib/routing/realtime-registry';
import { cn } from '@/utils/_cn';

type SyncFace = 'pending' | 'live' | 'paused';

export function LiveSyncIndicator() {
  const pathname = usePathname();
  const { health, degraded } = useRealtimeLink();

  // Latched: Ably's retry loop passes through `connecting` (health unknown)
  // between `disconnected` spells, so only a real connection clears "Sync
  // paused" and only a held outage sets it. Nothing is claimed before the
  // first connection.
  const [face, setFace] = useState<SyncFace>('pending');
  const next: SyncFace = degraded ? 'paused' : health === 'healthy' ? 'live' : face;
  if (next !== face) setFace(next);

  if (!realtimeRouteFor(pathname) || next === 'pending') return null;

  const paused = next === 'paused';

  return (
    // The top bar sits outside the page region; this wears the page's mode.
    <ChromeModeRegion>
      <Badge
        variant="secondary"
        role="status"
        aria-live="polite"
        data-testid="live-sync-indicator"
        data-sync={next}
        className={cn(
          'h-6 gap-1.5 border-mode-edge bg-mode-panel px-2',
          paused ? 'text-text-warning' : 'text-text-success',
        )}
      >
        <span aria-hidden className="size-1.5 shrink-0 rounded-mode-pill bg-current" />
        {/* The voice sits on its own span: the badge's role type would outrank it. */}
        <span className="mode-label">{paused ? REALTIME_DEGRADED_LABEL : 'Live'}</span>
      </Badge>
    </ChromeModeRegion>
  );
}
