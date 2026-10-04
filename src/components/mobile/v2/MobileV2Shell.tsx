'use client';

import { usePathname } from 'next/navigation';
import { Button } from '@/design-system/primitives';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import { ReceivingPhoneBridgeMount } from '@/components/mobile/receiving/ReceivingPhoneBridgeMount';
import { WmsRealtimeStatus } from '@/components/mobile/realtime/WmsRealtimeStatus';
import { MobileActionSlotProvider } from './MobileV2ActionSlot';
import { isClientPublicPath } from '@/contexts/AuthContext';
import { mobileRouteOwnsTopBar } from '@/lib/mobile/host-top-bar';
import { appMobilePageGroundClass } from '@/design-system/tokens/app-surface';
import { MobileV2TopBar } from './MobileV2TopBar';
import { MobileV2SearchProvider } from './MobileV2SearchContext';

function MobileV2PageError(error: Error, reset: () => void) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-5 text-center">
      <div className="w-full max-w-sm rounded-2xl border border-border-danger bg-surface-danger p-5">
        <p className="text-sm font-semibold text-text-danger">This screen hit an error</p>
        <p className="mt-2 break-words text-sm text-text-danger">
          {error.message || 'Something went wrong rendering this page.'}
        </p>
        <Button variant="danger" size="lg" radius="surface" onClick={reset} className="mt-4">
          Try again
        </Button>
      </div>
    </div>
  );
}

/**
 * The V2 migration seam. Feature pages remain live inside it while each legacy
 * presentation is replaced route-by-route.
 */
export function MobileV2Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showHeader = !!pathname && !mobileRouteOwnsTopBar(pathname);

  if (pathname && isClientPublicPath(pathname)) {
    return (
      <div
        className={`relative flex h-full min-h-0 flex-col overflow-hidden font-sans antialiased mobile-safe-area-frame ${appMobilePageGroundClass}`}
      >
        <ErrorBoundary label="mobile-v2-public-page" fallback={MobileV2PageError}>
          {children}
        </ErrorBoundary>
      </div>
    );
  }

  return (
    <MobileV2SearchProvider>
      <MobileActionSlotProvider>
        <div
          className={`relative flex h-full min-h-0 flex-col overflow-hidden font-sans antialiased mobile-safe-area-frame ${appMobilePageGroundClass}`}
          data-mobile-shell="v2"
        >
          {showHeader ? <MobileV2TopBar /> : null}
          <WmsRealtimeStatus />

          <main className="relative min-h-0 flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain">
            <div className="h-full">
              <ErrorBoundary key={pathname} label="mobile-v2-page" fallback={MobileV2PageError}>
                {children}
              </ErrorBoundary>
            </div>
          </main>

          <ReceivingPhoneBridgeMount />
        </div>
      </MobileActionSlotProvider>
    </MobileV2SearchProvider>
  );
}
