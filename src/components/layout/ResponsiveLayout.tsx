'use client';

import { type ReactNode, useState, useCallback, useEffect, useRef } from 'react';
import { Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePathname, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import { useUIMode } from '@/design-system/providers/UIModeProvider';
import { useBodyScrollLock } from '@/design-system/hooks';
import { AlertTriangle, RotateCcw, X } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { isMobileAllowedPath } from '@/lib/sidebar-navigation';
import { SIDEBAR_SPINE_WIDTH } from '@/components/sidebar/sidebar-spine';
import { ContextPanelLayout } from '@/components/sidebar/ContextPanelLayout';
import { isClientPublicPath } from '@/contexts/AuthContext';
import { GlobalHeader } from '@/components/layout/GlobalHeader';
import { appContentShellClass } from '@/components/layout/header-shell';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';
import { QuickAccessVisitRecorder } from '@/lib/quick-access/QuickAccessVisitRecorder';
import { usePhoneScanBridge } from '@/hooks/usePhoneScanBridge';
import { useGlobalWedgeScanner } from '@/hooks/useGlobalWedgeScanner';

// The sidebar is its own chunk: desktop mounts it immediately (the whole shell
// is client-gated behind `mounted`, so there is no SSR paint to preserve),
// while mobile routes never download it unless the drawer opens. The fixed-
// width placeholder keeps the desktop frame from shifting while the chunk
// lands.
const DashboardSidebar = dynamic(() => import('@/components/DashboardSidebar'), {
  ssr: false,
  // The spine owns no width — its host (the desktop push column or the mobile
  // drawer) does — so the placeholder just fills that host while the chunk
  // lands. The frame cannot jump, because the host's width never depended on
  // the chunk.
  loading: () => <div className="h-full w-full" aria-hidden />,
});
const SidebarNavColumn = dynamic(
  () => import('@/components/sidebar/SidebarNavColumn').then((m) => m.SidebarNavColumn),
  { ssr: false },
);

// On-demand chrome, split out of the shell chunk. All three render nothing
// until triggered (⌘K, scan event, Ably push), so deferring their JS past
// hydration changes no behavior — the listeners attach as soon as the split
// chunk lands, which is still within the first idle moments.
const CommandBar = dynamic(() => import('@/components/CommandBar').then((m) => m.CommandBar), { ssr: false });
const GlobalDesktopSkuScanner = dynamic(
  () => import('@/components/layout/GlobalDesktopSkuScanner').then((m) => m.GlobalDesktopSkuScanner),
  { ssr: false },
);
const ReceivingPhoneBridgeMount = dynamic(
  () => import('@/components/mobile/receiving/ReceivingPhoneBridgeMount').then((m) => m.ReceivingPhoneBridgeMount),
  { ssr: false },
);

/**
 * Mount-only component. Subscribes to phone-originated scans on
 * `phone:{staffId}` for the signed-in user and echoes lookups back on
 * `staffstation:{staffId}`. Runs on both desktop and mobile so either side can
 * service a scan from the other.
 */
function PhoneScanBridgeMount() {
  usePhoneScanBridge();
  return null;
}

/**
 * Mount-only component. Listens for HID wedge / Bluetooth ring-scanner
 * keystrokes anywhere in the app. URL-shaped scans navigate; bare codes
 * fire a `wedge-scan` CustomEvent for page-level handlers.
 */
function GlobalWedgeScannerMount() {
  useGlobalWedgeScanner();
  return null;
}

/**
 * Slim fallback shown when the sidebar subtree throws. It must be narrow chrome,
 * not a full-frame takeover: the whole point of wrapping the sidebar in an
 * `ErrorBoundary` is that the *main content keeps rendering* while only the rail
 * degrades. Offers a retry that re-mounts the sidebar.
 */
function SidebarFallback({ reset }: { reset: () => void }) {
  return (
    <aside className={cn('flex h-full shrink-0 flex-col border-r border-border-soft', SIDEBAR_SPINE_WIDTH, appChromeClass)}>
      <div className="m-3 rounded-lg border border-dashed border-rose-200 bg-rose-50 px-3 py-4 text-center">
        <AlertTriangle className="mx-auto h-5 w-5 text-rose-500" />
        <p className="mt-2 text-role-caption font-semibold text-rose-700">Sidebar unavailable</p>
        <p className="mt-1 text-role-eyebrow font-semibold uppercase tracking-widest text-rose-500">
          The rest of the page still works
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={reset}
          icon={<RotateCcw />}
          className="mt-3 bg-surface-card text-rose-700 ring-rose-200 hover:bg-rose-50"
        >
          Retry
        </Button>
      </div>
    </aside>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ResponsiveLayoutProps {
  children: ReactNode;
  /** True on a tenant kiosk host — see AuthContext's `kioskHost` prop. The
   *  device page (`/` → `/kiosk`) owns its own full-bleed chrome; it must
   *  never render the staff sidebar/header shell. */
  kioskHost?: boolean;
}

// ─── Drawer animation ────────────────────────────────────────────────────────

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const drawerVariants = {
  hidden: { x: '-100%' },
  visible: { x: 0 },
};

const drawerTransition = {
  type: 'spring' as const,
  damping: 28,
  stiffness: 320,
  mass: 0.8,
};

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * ResponsiveLayout — wraps the main app frame.
 *
 * Desktop: permanent sidebar on the left + main content (unchanged).
 * Mobile:  sidebar hidden by default, accessible as a slide-out drawer
 *          from the left. Hamburger button exposed via `useSidebarDrawer`.
 */
export function ResponsiveLayout({ children, kioskHost = false }: ResponsiveLayoutProps) {
  const { isMobile } = useUIMode();
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // A route's OWN sidebar (picker / facet rail / bench) is no longer mounted
  // here at all: `ContextPanelLayout` renders it inside the content region,
  // beside the workspace. The left column is the nav spine and nothing else.
  //
  // It is a PUSH column (`SidebarNavColumn`), so it does not auto-close: it
  // covers nothing, and a navigator that collapsed on the first row you clicked
  // would reflow the frame twice per jump for no gain. Closing is the toggle,
  // and nothing else. (The spine pre-expands the active page's modes on every
  // route change, so staying open stays coherent with where you are.)
  const [navOpen, setNavOpen] = useState(false);
  const toggleNav = useCallback(() => setNavOpen((prev) => !prev), []);
  // Desktop-only: while the spine is collapsed, resting the pointer at the far-left
  // edge for ~2s slides it in. `edgeArming` drives the progress sliver that fills
  // over the dwell as an "about to open" cue.
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [edgeArming, setEdgeArming] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  // Mobile devices may only reach a narrow allowlist of routes (see
  // isMobileAllowedPath() in sidebar-navigation.ts). Any other path on a
  // phone bounces to /m/home — the scan-first cockpit — so the device
  // stays focused on the warehouse-floor jobs it was issued for.
  const mobileRouteRestricted = isMobile && !isMobileAllowedPath(pathname);

  // `/m/*` routes are inherently mobile — the edge proxy only ever serves them
  // to phones. Device detection (useDeviceMode) is client-only, so on a fresh
  // load/refresh it reports `desktop` for the first render(s); without this the
  // page would flash the desktop layout (top header, no bottom nav) and then
  // snap to mobile once detection resolves — a refresh-only layout jump. Treat
  // `/m` paths as mobile deterministically so SSR + first paint match the final
  // layout (no blank gate, no desktop→mobile flip).
  const onMobileRoute = !!pathname && pathname.startsWith('/m');
  /** Auth / enroll / offline / kiosk-host — no permanent sidebar; page owns full-bleed chrome. */
  const chromeless = isClientPublicPath(pathname) || kioskHost;

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Arm / cancel the 2-second left-edge dwell that re-opens the collapsed sidebar.
  const armSidebarPeek = useCallback(() => {
    if (peekTimer.current) clearTimeout(peekTimer.current);
    setEdgeArming(true);
    peekTimer.current = setTimeout(() => {
      setNavOpen(true);
      setEdgeArming(false);
    }, 2000);
  }, []);
  const cancelSidebarPeek = useCallback(() => {
    if (peekTimer.current) {
      clearTimeout(peekTimer.current);
      peekTimer.current = null;
    }
    setEdgeArming(false);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Allow any component to open the mobile drawer via a global event
  useEffect(() => {
    const handler = () => setDrawerOpen(true);
    window.addEventListener('open-mobile-drawer', handler);
    return () => window.removeEventListener('open-mobile-drawer', handler);
  }, []);

  // Close drawer when the route changes (e.g. user picked a page in the drawer)
  useEffect(() => {
    if (!isMobile) return;
    setDrawerOpen(false);
  }, [pathname, isMobile]);

  // Clear any pending left-edge dwell timer on unmount.
  useEffect(
    () => () => {
      if (peekTimer.current) clearTimeout(peekTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!mobileRouteRestricted) return;
    router.replace('/m/home');
  }, [mobileRouteRestricted, router]);

  // Lock body scroll when drawer is open (restores prior overflow on close).
  useBodyScrollLock(drawerOpen);

  // Pre-hydration paint policy for the blank gate:
  //   • `/m` routes render the mobile shell deterministically (`onMobileRoute`),
  //     so there's nothing to wait for.
  //   • Desktop-only routes (NOT in the mobile allowlist) always resolve to the
  //     desktop branch as their final state — a phone bounces to `/m/home` via
  //     `mobileRouteRestricted` rather than rendering an in-place mobile branch —
  //     so there is no desktop→mobile flip to hide. Let their server-rendered
  //     shell paint pre-hydration instead of blanking it. The whole shell used
  //     to be client-gated here, so nothing the server rendered ever painted;
  //     this is the LCP lever (richer first paint before hydration).
  //   • Mobile-allowed non-`/m` routes DO flip to a content-only mobile branch
  //     once device detection resolves (first render is always `desktop`), so
  //     they keep the blank to avoid the desktop→mobile flash.
  if (!mounted && !onMobileRoute && isMobileAllowedPath(pathname)) {
    return <div className={cn('flex min-h-0 flex-1', appChromeClass)} aria-hidden="true" />;
  }

  // Drawer overlay is rendered regardless of which branch is active so pages
  // that ship their own mobile UI (e.g. /receiving uses `md:hidden`) can still
  // open the side nav at narrow viewports — useUIMode can return `desktop`
  // when device detection misses and we'd otherwise leave the drawer
  // unmounted. CSS-hides on real desktop widths — every desktop route now has
  // the permanent (collapsible) sidebar, so the drawer is mobile-only.
  const drawerOverlay = (
    <AnimatePresence>
      {drawerOpen && (
        <div className="md:hidden">
          <motion.div
            key="drawer-backdrop"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-panelBackdrop bg-scrim/40 backdrop-blur-[2px]"
            onClick={closeDrawer}
            aria-hidden
          />
          <motion.div
            ref={drawerRef}
            key="drawer-panel"
            variants={drawerVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={drawerTransition}
            className="fixed inset-y-0 left-0 z-panel w-full max-w-xs shadow-2xl"
          >
            <IconButton
              onClick={closeDrawer}
              ariaLabel="Close navigation"
              className="absolute top-[max(0.5rem,env(safe-area-inset-top))] right-3 z-10 h-11 w-11 flex items-center justify-center rounded-xl bg-surface-sunken active:scale-95 active:bg-surface-strong transition-transform"
              icon={<X className="h-5 w-5 text-text-muted" />}
            />
            <ErrorBoundary
              label="sidebar-drawer"
              fallback={(_e, reset) => <SidebarFallback reset={reset} />}
            >
              <Suspense fallback={null}>
                <DashboardSidebar inDrawer onNavigate={closeDrawer} />
              </Suspense>
            </ErrorBoundary>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  // ── Desktop layout ──
  // `/m` routes always use the mobile shell, even before client detection
  // resolves, so a refresh never flashes the desktop frame.
  if (!isMobile && !onMobileRoute) {
    return (
      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
        <GlobalWedgeScannerMount />
        <PhoneScanBridgeMount />

        {/* The nav spine — the page list, and only the page list. It is a flex
            SIBLING of the header+content column, so opening it moves the frame
            right instead of painting over it. The route's own sidebar rides
            inside `<main>`, so the two never contend for the same edge. */}
        {!chromeless && (
          <ErrorBoundary label="sidebar-nav-column" fallback={() => null}>
            <Suspense fallback={null}>
              <SidebarNavColumn open={navOpen}>
                <DashboardSidebar />
              </SidebarNavColumn>
            </Suspense>
          </ErrorBoundary>
        )}

        <div className={cn('relative flex h-full min-w-0 flex-1 flex-col overflow-hidden', appChromeClass)}>
          {!chromeless && (
          <GlobalHeader
            canCollapseSidebar
            sidebarCollapsed={!navOpen}
            onToggleSidebar={toggleNav}
          />
          )}
          <main className={cn(chromeless ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden' : appContentShellClass)}>
            {/* The route's own sidebar rides HERE, beside the workspace — one
                wrapper for every route, benches included. See
                `ContextPanelLayout`. */}
            {chromeless ? children : <ContextPanelLayout>{children}</ContextPanelLayout>}
          </main>
        </div>

        {/* Left-edge reveal — rest the pointer against the far-left edge for
            ~2s and the page list slides in. Only while it is collapsed: the
            open column occupies that edge, and this strip is `fixed` above the
            in-flow frame, so leaving it mounted would swallow clicks on the
            spine's own left 24px. */}
        {!chromeless && !navOpen && (
          <div
            className="fixed bottom-0 left-0 top-10 z-40 w-6"
            onMouseEnter={armSidebarPeek}
            onMouseLeave={cancelSidebarPeek}
            aria-hidden
          >
            <AnimatePresence>
              {edgeArming && (
                <motion.div
                  key="edge-arming"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="absolute inset-y-0 left-0 w-1 overflow-hidden rounded-r-full bg-surface-strong/60"
                >
                  {/* Fills top→bottom over the 2s dwell — a progress cue that the
                      sidebar is about to open. */}
                  <motion.div
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ duration: 2, ease: 'linear' }}
                    style={{ transformOrigin: 'top' }}
                    className="h-full w-full bg-blue-500"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <CommandBar />
        <Suspense fallback={null}>
          <GlobalDesktopSkuScanner />
        </Suspense>
        <Suspense fallback={null}>
          <QuickAccessVisitRecorder />
        </Suspense>
        {drawerOverlay}
      </div>
    );
  }

  if (mobileRouteRestricted) {
    return <div className={cn('flex min-h-0 flex-1', appChromeClass)} aria-hidden="true" />;
  }

  // ── Mobile layout: content only ──
  //
  // Chrome-light: bottom nav lives in /m/layout.tsx (admin-gated). No global
  // overlay FABs — scan is the centre tab; quick access lives in page headers
  // where a route ships its own mobile chrome.
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
      </main>
    </div>
  );
}
