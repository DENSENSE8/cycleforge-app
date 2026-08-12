'use client';

import { type ReactNode, useState, useCallback, useEffect, useRef } from 'react';
import { Suspense } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
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
import { RightRailHost } from '@/components/right-rail/RightRailHost';
import { setRightRailFrameWidth } from '@/lib/right-rail/frame';
import { isClientPublicPath } from '@/contexts/AuthContext';
import { GlobalHeader } from '@/components/layout/GlobalHeader';
import { appContentShellClass } from '@/components/layout/header-shell';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';
import { usePhoneScanBridge } from '@/hooks/usePhoneScanBridge';
import { useGlobalWedgeScanner } from '@/hooks/useGlobalWedgeScanner';
import { warmSpineChunk } from '@/components/sidebar/preload-spine';

// The sidebar is its own chunk: desktop mounts it immediately (the whole shell
// is client-gated behind `mounted`, so there is no SSR paint to preserve),
// while mobile routes never download it unless the drawer opens. The fixed-
// width placeholder keeps the desktop frame from shifting while the chunk
// lands.
//
// Named `.then` (same pattern as `SidebarNavColumn`) so knip sees the export
// as live. Warm still goes through `warmSpineChunk` (bundler dedupes the chunk).
const DashboardSidebar = dynamic(
  () => import('@/components/DashboardSidebar').then((m) => m.DashboardSidebar),
  {
    ssr: false,
    // The spine owns no width — its host (the desktop push column or the mobile
    // drawer) does — so the placeholder just fills that host while the chunk
    // lands. The frame cannot jump, because the host's width never depended on
    // the chunk.
    //
    // This placeholder is INVISIBLE on purpose, and that is only defensible
    // because the chunk is warmed before the operator can see it (measured: a
    // cold first open showed 306ms of fully-formed empty column; warm shows
    // rows before the width even moves). See `preload-spine.ts` — the fix is to
    // fetch earlier, not to draw fake rows over the wait.
    loading: () => <div className="h-full w-full" aria-hidden />,
  },
);
const SidebarNavColumn = dynamic(
  () => import('@/components/sidebar/SidebarNavColumn').then((m) => m.SidebarNavColumn),
  { ssr: false },
);

// On-demand chrome, split out of the shell chunk. All three render nothing
// until triggered (⌘K, scan event, Ably push), so deferring their JS past
// hydration changes no behavior — the listeners attach as soon as the split
// chunk lands, which is still within the first idle moments.
const CommandBar = dynamic(() => import('@/components/CommandBar').then((m) => m.CommandBar), { ssr: false });
// Owns the ⌘⇧V chord + the single desktop clipboard-panel mount. Must be here
// rather than in the spine footer: that footer mounts lazily on first spine
// open, so a chord bound there would be dead on every fresh page load.
const ClipboardHistoryHost = dynamic(
  () => import('@/components/quick-access/ClipboardHistoryHost').then((m) => m.ClipboardHistoryHost),
  { ssr: false },
);
// Owns the ⌘⇧U chord + the single throw-a-task panel mount, here for the same
// reason as the clipboard host: the spine ⋯ row that also opens it does not
// exist until the operator has opened the spine at least once.
const ThrowTaskHost = dynamic(
  () => import('@/components/quick-access/ThrowTaskHost').then((m) => m.ThrowTaskHost),
  { ssr: false },
);
import { VendorViewMaskHost } from '@/components/desktop/VendorViewMaskHost';
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
  // would reflow the frame twice per jump for no gain. Closing is the toggle
  // (and nothing else). Reopen paths: GlobalHeader toggle, or ⌘K. Collapsed
  // hover peeks Home/Search/Media/Chat on the toggle (`SidebarCollapseControl`)
  // — the old 2s left-edge dwell was removed so that corner has one hover answer.
  // (The spine pre-expands the active page's modes on every route change, so
  // staying open stays coherent with where you are.)
  const [navOpen, setNavOpen] = useState(false);
  const toggleNav = useCallback(() => setNavOpen((prev) => !prev), []);
  const drawerRef = useRef<HTMLDivElement>(null);
  // The CONTENT ROW, measured for the right rail's push/overlay decision. This
  // element and not a descendant: its width is invariant under everything the
  // resolver decides (parking the route rail and growing the panel both
  // redistribute space INSIDE it), so the measurement can never chase its own
  // consequence. See `lib/right-rail/frame.ts`.
  const contentRowRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    setMounted(true);
  }, []);

  /**
   * Warm the spine chunk during the first idle window — the backstop tier of
   * the prefetch (`preload-spine.ts`). Hover/focus on the toggle covers the
   * pointer path; this covers the operator who taps, or Tabs straight to it,
   * or clicks faster than the fetch.
   *
   * It FETCHES, it does not mount: the column still starts collapsed and the
   * nav graph still does not render, so `SidebarNavColumn`'s bundle-altitude
   * rule holds. `requestIdleCallback` (with a fallback timer for Safari) keeps
   * it strictly behind paint and hydration.
   *
   * Desktop only, chromeful only — a mobile route uses the drawer and a
   * kiosk/public path has no spine to open, so warming there is pure waste.
   */
  useEffect(() => {
    if (!mounted || isMobile || onMobileRoute || chromeless) return;
    const ric = (window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    }).requestIdleCallback;
    if (ric) {
      const id = ric(() => warmSpineChunk(), { timeout: 2_000 });
      return () => window.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(warmSpineChunk, 1_000);
    return () => window.clearTimeout(t);
  }, [mounted, isMobile, onMobileRoute, chromeless]);

  // Publish the content row's width to the right-rail frame store. `useEffect`
  // (not layout) is fine: a resident desktop inspector stays in-flow before
  // measurement, then the resolver decides whether the context rail yields.
  useEffect(() => {
    const el = contentRowRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const publish = () => setRightRailFrameWidth(Math.round(el.getBoundingClientRect().width));
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mounted, isMobile, onMobileRoute, chromeless]);

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

  useEffect(() => {
    if (!mobileRouteRestricted) return;
    router.replace('/m/home');
  }, [mobileRouteRestricted, router]);

  // Lock body scroll when drawer is open (restores prior overflow on close).
  useBodyScrollLock(drawerOpen);

  // There is NO pre-hydration blank gate, and there must not be one again.
  //
  // Mobile is a ROUTING decision, not a width decision: phones are served the
  // `/m/*` shell by the edge proxy, and a phone that lands on a desktop-only
  // path bounces to `/m/home` via `mobileRouteRestricted`. So a non-`/m` route
  // resolves to the desktop branch as its FINAL state on every device — there
  // is no desktop→mobile flip left to hide.
  //
  // The gate that used to sit here returned `<div aria-hidden />` for every
  // mobile-allowed path (`/unbox`, `/receiving`, `/triage`, `/pack`, …) until
  // `mounted` flipped after hydration. Because `mounted` starts false on the
  // server, that blanked the ENTIRE shell in the SSR HTML: `/unbox` shipped
  // 285KB of flight payload over 544 bytes of empty DOM, so no server-rendered
  // content could ever own LCP and every station's first paint waited on the
  // JS bundle. Deleting it is the LCP lever — see the Paint content order SoT
  // (P0 shell must paint).

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
  //
  // The branch is keyed on the ROUTE, never on viewport width. `/m` routes get
  // the mobile shell (deterministically, so a refresh never flashes the desktop
  // frame); every other route gets this one on every device.
  //
  // It used to read `!isMobile && !onMobileRoute`, which flipped a non-`/m`
  // route to the content-only mobile branch once client-side device detection
  // resolved. That in-place flip is what forced the pre-hydration blank gate
  // above (to hide the flash), and the blank gate is what cost the whole app
  // its SSR paint. It was also redundant: `/m/*` already IS the mobile routing
  // answer, and pages that need a narrow-width treatment do it in CSS
  // (`md:hidden`), which keeps working here because CSS needs no JS to resolve.
  if (!onMobileRoute) {
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
                `ContextPanelLayout`.

                The right rail is its mirror on the trailing edge: a flex-row
                sibling, so a non-modal inspector PUSHES the workspace instead of
                floating over it (`source-of-truth.md` → Right-rail modality).
                It lives inside `<main>` rather than beside the header+content
                column on purpose — `appContentShellClass` already paints the
                canvas + wash its card needs as a ground plane, and GlobalHeader
                stays full width, which keeps the header's own right-rail slot
                geometry true. */}
            {chromeless ? (
              children
            ) : (
              <div ref={contentRowRef} className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
                <ContextPanelLayout>{children}</ContextPanelLayout>
                <RightRailHost />
              </div>
            )}
          </main>
          {/* Chromeless (auth / enroll / offline): no content row exists to
              share with an in-flow details column. */}
          {chromeless ? <RightRailHost inline={false} /> : null}
        </div>

        <CommandBar />
        <ClipboardHistoryHost />
        <ThrowTaskHost />
        <VendorViewMaskHost />
        <Suspense fallback={null}>
          <GlobalDesktopSkuScanner />
        </Suspense>
        {drawerOverlay}
      </div>
    );
  }

  // (The `mobileRouteRestricted` blank that used to sit here is gone: only `/m`
  // paths reach this far now, and `/m` is always mobile-allowed, so it could
  // never fire. The redirect effect above still bounces a phone off a
  // desktop-only path — that is routing, and it is unchanged.)

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

      {/* Mobile is explicitly overlay-only: it has no horizontal content row.
          Desktop width pressure never invokes this branch. */}
      <RightRailHost inline={false} />
    </div>
  );
}
