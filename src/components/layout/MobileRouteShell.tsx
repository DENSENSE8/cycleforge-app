'use client';

/** The `/m/*` frame — content plus the three listeners a handheld needs. */

import { useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { GlobalWedgeScannerMount, PhoneScanBridgeMount, StaffPrintBridgeMount } from '@/components/layout/scan-mounts';
import { ReceivingPhoneBridgeMount } from '@/components/mobile/receiving/ReceivingPhoneBridgeMount';
import { RightRailHost } from '@/components/right-rail/RightRailHost';
import { recordMobileVisit } from '@/lib/mobile/nav-trail';

export function MobileRouteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Every /m landing joins the trail detail-bar Back reads (`lib/mobile/nav-trail`).
  useEffect(() => {
    if (pathname) recordMobileVisit(pathname);
  }, [pathname]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Mirror of desktop: subscribe to phone:{staffId} so any device the
          user is signed in on can service the lookup. */}
      <PhoneScanBridgeMount />
      <ReceivingPhoneBridgeMount />
      <StaffPrintBridgeMount />

      {/* Same wedge scanner listener as desktop — works for HID-over-USB on
          tablets and Bluetooth ring scanners paired to a phone. */}
      <GlobalWedgeScannerMount />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </main>

      {/* Mobile is explicitly overlay-only: it has no horizontal content row.
          Desktop width pressure never invokes this branch. */}
      <RightRailHost inline={false} />
    </div>
  );
}
