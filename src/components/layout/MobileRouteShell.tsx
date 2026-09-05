'use client';

/**
 * The `/m/*` frame — content plus the three listeners a handheld needs.
 *
 * ## Why this is its own file
 *
 * It was the second branch of `ResponsiveLayout`, chosen at render time from
 * `pathname.startsWith('/m')`. Splitting it out lets `WarehouseShell` pick the
 * frame by pathname on the SERVER — mobile is a routing decision in this app
 * (the edge proxy serves phones `/m/*`), so the pick is deterministic: no device
 * detection, no desktop→mobile flash, no pre-hydration gate. It also keeps the
 * handheld frame legible on its own terms instead of as the `else` of a
 * 478-line desk module.
 *
 * What it did NOT do, measured: shrink the phone's payload. The intent was that
 * `next/dynamic` on each frame would keep the desk chrome (header, nav spine,
 * command bar, context panel, desktop scanner) out of the `/m/*` bundle. On the
 * mobile profile `/m/scan` still downloaded 844KB across 60 chunks afterwards —
 * unchanged. A dynamic import from a Server Component does not prune the route's
 * client-reference graph the way a static-analysis split would. The structure is
 * worth keeping; do not attribute a payload win to it that is not there.
 *
 * Chrome-light by design: the bottom nav lives in `/m/layout.tsx` (admin-gated),
 * there are no global overlay FABs, scan is the centre tab, and quick access
 * lives in the page headers of routes that ship their own mobile chrome.
 */

import type { ReactNode } from 'react';
import { GlobalWedgeScannerMount, PhoneScanBridgeMount } from '@/components/layout/scan-mounts';
import { ReceivingPhoneBridgeMount } from '@/components/mobile/receiving/ReceivingPhoneBridgeMount';
import { RightRailHost } from '@/components/right-rail/RightRailHost';
import { DeskComposerAskLane } from '@/components/composer/DeskComposerAskLane';

export function MobileRouteShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Mirror of desktop: subscribe to phone:{staffId} so any device the
          user is signed in on can service the lookup. */}
      <PhoneScanBridgeMount />
      <ReceivingPhoneBridgeMount />

      {/* Same wedge scanner listener as desktop — works for HID-over-USB on
          tablets and Bluetooth ring scanners paired to a phone. */}
      <GlobalWedgeScannerMount />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
        <DeskComposerAskLane />
      </main>

      {/* Mobile is explicitly overlay-only: it has no horizontal content row.
          Desktop width pressure never invokes this branch. */}
      <RightRailHost inline={false} />
    </div>
  );
}
