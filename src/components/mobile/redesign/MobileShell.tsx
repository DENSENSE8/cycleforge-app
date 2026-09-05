'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { motion, AnimatePresence } from '@/design-system/motion';
import { usePathname } from 'next/navigation';
import { MobileTopBar } from './MobileTopBar';
import { MobileSidebarDrawer } from './MobileSidebarDrawer';
import { MobileScanProvider } from './mobile-scan-cta';
import { TOKENS } from './DesignSystem';
import { ReceivingPhoneBridgeMount } from '@/components/mobile/receiving/ReceivingPhoneBridgeMount';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import { Button } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

/**
 * Phone fallback when a page subtree throws. Without this, a render crash bubbles
 * to global-error and blanks the whole app to a WHITE SCREEN with nothing to act
 * on. Here it degrades to a readable, retryable card (house "degrade-not-fail")
 * and `ErrorBoundary` logs the true cause to the console for diagnosis.
 */
function MobilePageError(error: Error, reset: () => void) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="w-full max-w-sm rounded-none border border-dashed border-rose-200 bg-rose-50 px-4 py-6">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-rose-700">
          This screen hit an error
        </p>
        <p className="mt-2 break-words text-role-caption font-semibold text-rose-600">
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
 * Routes that must NOT get the host header — because they already own a top bar
 * of their own (a back chevron + record title), or because they run before
 * sign-in.
 *
 * This is a DENYLIST on purpose. It replaced an exact-match allowlist of nine
 * paths (2026-08-21), under which every route added since — `/m/identify`,
 * `/m/orders/[orderId]` — silently shipped with no header at all, and therefore
 * no way to start a scan without backing out first. An allowlist fails closed on
 * the routes nobody remembered to add; a denylist fails open, which is the
 * correct default when the thing being withheld is the app's primary action.
 *
 * A trailing slash is load-bearing: `/m/pick/` excludes the pick DETAIL screen
 * (which owns a bar) while `/m/pick` itself still gets the header.
 */
const OWN_TOP_BAR_PREFIXES = [
  '/m/signin',
  '/m/enroll',
  '/m/receiving/po',
  '/m/r/',
  '/m/u/',
  '/m/rs/',
  '/m/h/',
  '/m/b/',
  '/m/pick/',
];

const ownsItsOwnTopBar = (pathname: string): boolean =>
  OWN_TOP_BAR_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));

/**
 * Routes whose header FLOATS over the page instead of stacking above it.
 *
 * An ALLOWLIST, unlike the header denylist above, and for the opposite reason:
 * failing open here would slide every mobile screen's first row under the bar
 * at once. A route belongs on this list when its content is bottom-anchored —
 * a station tape grows upward off the capture sheet, so its top edge is exactly
 * where a translucent bar wants something to read through it, and there is no
 * first row to hide when the list is short.
 */
const OVERLAY_HEADER_PREFIXES = ['/m/scan-out'];

const wantsOverlayHeader = (pathname: string): boolean =>
  OVERLAY_HEADER_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export const RedesignedMobileShell = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const showHeader = !!pathname && !ownsItsOwnTopBar(pathname);
  const overlayHeader = !!pathname && wantsOverlayHeader(pathname);
  // True only while the document's first page is mounting (SSR + hydration).
  // Read during render, flipped after — every later `key={pathname}` mount is a
  // client navigation and gets the crossfade.
  const firstPaintRef = useRef(true);
  useEffect(() => {
    firstPaintRef.current = false;
  }, []);

  return (
    // The scan provider wraps BOTH the header and the page: the top-right SCAN
    // CTA lives in the header, the surface it re-arms is in `children`.
    <MobileScanProvider>
      <div
        className={cn(
          'flex h-full min-h-0 flex-col overflow-hidden font-sans antialiased safe-area-padding',
          TOKENS.colors.background,
          // The overlay header is positioned against THIS box, so it needs a
          // containing block. Harmless when no route wants one.
          'relative',
        )}
      >
        {showHeader && (
          <MobileTopBar onMenu={() => setSidebarOpen(true)} overlay={overlayHeader} />
        )}

        <main className="relative min-h-0 flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-x-none overscroll-contain">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              // FIRST PAINT IS NEVER ANIMATED. `initial={{opacity:0}}` applies
              // to the SSR mount too, so every `/m/*` document shipped its whole
              // page inside `style="opacity:0"` and only revealed it once
              // hydration ran the fade — LCP stopped measuring the HTML (~0.4s)
              // and started measuring the bundle (~9s on the mobile profile).
              // Route-to-route crossfades still animate; the document's first
              // mount shows immediately.
              initial={firstPaintRef.current ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 0.15,
                ease: [0.23, 1, 0.32, 1],
              }}
              className="h-full"
            >
              <ErrorBoundary key={pathname} label="mobile-page" fallback={MobilePageError}>
                {children}
              </ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </main>

        <Suspense fallback={null}>
          <MobileSidebarDrawer open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        </Suspense>

        <ReceivingPhoneBridgeMount />
      </div>
    </MobileScanProvider>
  );
};
