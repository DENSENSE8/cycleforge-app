'use client';

import { useState, useEffect, Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { MobileTopBar } from './MobileTopBar';
import { MobileSidebarDrawer } from './MobileSidebarDrawer';
import { MobileActionSlotProvider } from './MobileActionSlot';
import { MobileScanProvider } from './mobile-scan-cta';
import { TOKENS } from './DesignSystem';
import { ReceivingPhoneBridgeMount } from '@/components/mobile/receiving/ReceivingPhoneBridgeMount';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import { isClientPublicPath } from '@/contexts/AuthContext';
import { mobileRouteOwnsTopBar } from '@/lib/mobile/host-top-bar';
import { Button } from '@/design-system/primitives';
import { WmsRealtimeStatus } from '@/components/mobile/realtime/WmsRealtimeStatus';

/** Phone fallback when a page subtree throws. */
function MobilePageError(error: Error, reset: () => void) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="w-full max-w-sm rounded-none border border-dashed border-border-danger bg-surface-danger px-4 py-6">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-text-danger">
          This screen hit an error
        </p>
        <p className="mt-2 break-words text-role-caption font-semibold text-text-danger">
          {error.message || 'Something went wrong rendering this page.'}
        </p>
        <Button variant="danger" size="lg" onClick={reset} className="mt-4">
          Try again
        </Button>
      </div>
    </div>
  );
}

/**
 * Global Mobile Shell for 2026 Redesign.
 * Fullscreen photo flows live under `app/m/(immersive)` and do not mount this shell.
 */

/**
 * Which routes withhold the host header — and with it the scan seat — is
 * {@link mobileRouteOwnsTopBar}, shared with `MobileDetailTopBar` so the seat
 * is mounted exactly once per screen. Add a route there, not here.
 */

const wantsOverlayHeader = (pathname: string): boolean =>
  pathname === '/m/scan' || pathname.startsWith('/m/scan/');

export const RedesignedMobileShell = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Drawer reads client session state; defer its first mount until hydration so
  // the server and browser produce the same initial shell tree.
  const [isHydrated, setIsHydrated] = useState(false);
  const showHeader = !!pathname && !mobileRouteOwnsTopBar(pathname);
  const overlayHeader = !!pathname && wantsOverlayHeader(pathname);
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  /** PRE-SIGN-IN: the page, and nothing else. */
  if (pathname && isClientPublicPath(pathname)) {
    return (
      <div
        className={`flex h-full min-h-0 flex-col overflow-hidden font-sans antialiased safe-area-padding ${TOKENS.colors.background}`}
      >
        <ErrorBoundary label="mobile-public-page" fallback={MobilePageError}>
          {children}
        </ErrorBoundary>
      </div>
    );
  }


  return (
    // Both providers wrap the header AND the page, for the same reason:
    <MobileScanProvider>
      <MobileActionSlotProvider>
      <div
        className={`relative flex h-full min-h-0 overflow-hidden font-sans antialiased safe-area-padding ${TOKENS.colors.background}`}
      >
        {isHydrated ? <MobileSidebarDrawer open={false} onClose={() => undefined} presentation="rail" /> : null}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {showHeader && <MobileTopBar onMenu={() => setSidebarOpen(true)} overlay={overlayHeader} />}
          <WmsRealtimeStatus />

          <div className="relative min-h-0 flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-x-none overscroll-contain">
          {/*
 * No route animation (operator 2026-09-25:
 * No route animation (operator 2026-09-25: "it shouldn't even display
 */}
          <div className="h-full">
            <ErrorBoundary key={pathname} label="mobile-page" fallback={MobilePageError}>
              {children}
            </ErrorBoundary>
          </div>
          </div>
        </div>

        <Suspense fallback={null}>
          <MobileSidebarDrawer open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        </Suspense>

        <ReceivingPhoneBridgeMount />
      </div>
      </MobileActionSlotProvider>
    </MobileScanProvider>
  );
};
