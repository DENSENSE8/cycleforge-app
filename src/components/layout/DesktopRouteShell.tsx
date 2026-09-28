'use client';

import { type ReactNode, useState, useCallback, useEffect, useRef } from 'react';
import { Suspense } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
import { usePathname, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import { useUIMode } from '@/design-system/providers/UIModeProvider';
import { useBodyScrollLock } from '@/design-system/hooks';
import { useDeskFloorActive } from '@/design-system/components/DeskStageContext';
import { AlertTriangle, RotateCcw, X } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { isMobileAllowedPath } from '@/lib/sidebar-navigation';
import { SIDEBAR_SPINE_WIDTH } from '@/components/sidebar/sidebar-spine';
import { ContextPanelLayout } from '@/components/sidebar/ContextPanelLayout';
import { RightRailHost } from '@/components/right-rail/RightRailHost';
import { GlobalWedgeScannerMount, PhoneScanBridgeMount, StaffPrintBridgeMount } from '@/components/layout/scan-mounts';
import { setRightRailFrameWidth } from '@/lib/right-rail/frame';
import { setSidebarColumnOpen } from '@/lib/nav/sidebar-column-store';
import { useSidebarToggleHotkey } from '@/lib/nav/sidebar-toggle-hotkey';
import { isClientPublicPath } from '@/contexts/AuthContext';
import { GlobalHeader } from '@/components/layout/GlobalHeader';
import { MASTER_NAV_TOGGLE_EVENT } from '@/lib/app-events';
import { useHoverSurface } from '@/hooks/useHoverSurface';
import { appContentShellClass } from '@/components/layout/header-shell';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';
import { warmSpineChunk } from '@/components/sidebar/preload-spine';
import {
  NavRolloutProbe,
  useContextualSidebarActive,
} from '@/components/sidebar/contextual/useNavContext';
import { OrgCapabilitiesRealtime } from '@/hooks/useOrgCapabilities';
import { useLocalStorage } from '@/hooks';

// The sidebar is its own chunk:
const DashboardSidebar = dynamic(
  () => import('@/components/DashboardSidebar').then((m) => m.DashboardSidebar),
  {
    ssr: false,
    // The spine owns no width — its host (the desktop push column or the mobile drawer) does — so the placeholder just fills that host while…
    loading: () => <div className="h-full w-full" aria-hidden />,
  },
);
const SidebarNavColumn = dynamic(
  () => import('@/components/sidebar/SidebarNavColumn').then((m) => m.SidebarNavColumn),
  { ssr: false },
);
// THE desktop sidebar — a contextual page's panel, or the page map everywhere
// else. One host, so the parent sidebar never falls back to an older face.
const ContextualSidebar = dynamic(
  () => import('@/components/sidebar/contextual/ContextualSidebar').then((m) => m.ContextualSidebar),
  { ssr: false, loading: () => <div className="h-full w-full" aria-hidden /> },
);

// On-demand chrome, split out of the shell chunk. Find / clipboard / throw /
// scanner render nothing until triggered, so deferring their JS past hydration is safe.
const CommandBar = dynamic(
  () => import('@/components/CommandBar').then((m) => m.CommandBar),
  { ssr: false },
);
// Clipboard host owns the ⌘⇧V chord + the single desktop clipboard-panel mount.
// Must be here rather than in the spine footer: that footer mounts lazily on
// first spine open, so a chord bound there would be dead on every fresh page load.
const ClipboardHistoryHost = dynamic(
  () => import('@/components/quick-access/ClipboardHistoryHost').then((m) => m.ClipboardHistoryHost),
  { ssr: false },
);
// Owns the ⌘⇧U chord + the single throw-a-task panel mount, here for the same
// reason as the clipboard host: binding the chord on a lazily-mounted trigger
// would be dead on every fresh page load. Discovery is the header goal chip.
const ThrowTaskHost = dynamic(
  () => import('@/components/quick-access/ThrowTaskHost').then((m) => m.ThrowTaskHost),
  { ssr: false },
);
const GlobalDesktopSkuScanner = dynamic(
  () => import('@/components/layout/GlobalDesktopSkuScanner').then((m) => m.GlobalDesktopSkuScanner),
  { ssr: false },
);


/** Slim fallback shown when the sidebar subtree throws. */
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

interface DesktopRouteShellProps {
  children: ReactNode;
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

/** ResponsiveLayout — wraps the desktop app frame. */
export function DesktopRouteShell({ children }: DesktopRouteShellProps) {
  const { isMobile } = useUIMode();
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // A route's OWN sidebar (picker / facet rail / bench) is no longer mounted here at all:
  const [navOpen, setNavOpen] = useState(false);
  // A contextual page's sidebar carries its views and filters, so it is open
  // unless the operator closed it (remembered); the spine keeps its own state.
  const contextualActive = useContextualSidebarActive();
  const [contextualOpen, setContextualOpen] = useLocalStorage('contextual-sidebar-open', true);
  const contextualActiveRef = useRef(contextualActive);
  contextualActiveRef.current = contextualActive;
  const toggleNav = useCallback(() => {
    if (contextualActiveRef.current) setContextualOpen((prev) => !prev);
    else setNavOpen((prev) => !prev);
  }, [setContextualOpen]);
  useEffect(() => {
    window.addEventListener(MASTER_NAV_TOGGLE_EVENT, toggleNav);
    return () => window.removeEventListener(MASTER_NAV_TOGGLE_EVENT, toggleNav);
  }, [toggleNav]);
  // Floor (a desk's industrial full canvas) parks the column for the session
  // without touching the remembered choice (owner 2026-09-26).
  const deskFloor = useDeskFloorActive();
  const columnOpen = (contextualActive ? contextualOpen : navOpen) && !deskFloor;
  // ⌘\ / Ctrl+\ opens and closes the column (owner 2026-09-27); the toggle's
  // tooltip shows the chord. Off on Floor — the column is parked there, and a
  // toggle would silently flip the remembered choice.
  useSidebarToggleHotkey(toggleNav, !deskFloor);
  const navPeek = useHoverSurface({
    id: 'master-nav-spine-peek',
    disabled: true,
  });
  const drawerRef = useRef<HTMLDivElement>(null);
  // The CONTENT ROW, measured for the right rail's push/overlay decision.
  const contentRowRef = useRef<HTMLDivElement>(null);
  // Mobile devices may only reach a narrow allowlist of routes (see isMobileAllowedPath() in sidebar-navigation.ts).
  const mobileRouteRestricted = isMobile && !isMobileAllowedPath(pathname);

  // `/m/*` routes are inherently mobile — the edge proxy only ever serves them to phones.
  const onMobileRoute = !!pathname && pathname.startsWith('/m');
  /** Auth / enroll / offline — no permanent sidebar; page owns full-bleed chrome.
   *  (Kiosk paths never reach this shell: `AppShellSwitch` gives them `KioskAppShell`.) */
  const chromeless = isClientPublicPath(pathname);
  // Pages move their own controls in (e.g. the order list's Find) while the
  // column is closed.
  useEffect(() => {
    setSidebarColumnOpen(columnOpen && !chromeless);
  }, [columnOpen, chromeless]);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  useEffect(() => {
    setMounted(true);
  }, []);

  /** Warm the spine chunk during the first idle window — the backstop tier of the prefetch (`preload-spine.ts`). */
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

  // Drawer overlay is rendered regardless of which branch is active so pages that ship their own mobile UI (e.g.
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
  if (!onMobileRoute) {
    return (
      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
        <GlobalWedgeScannerMount />
        <PhoneScanBridgeMount />
        <StaffPrintBridgeMount />

        {/* The nav column — one host for every page. The probe publishes
            whether the page has its own panel (it opens the column by default). */}
        {!chromeless && (
          <ErrorBoundary label="sidebar-nav-column" fallback={() => null}>
            <Suspense fallback={null}>
              <NavRolloutProbe />
              <OrgCapabilitiesRealtime />
              <SidebarNavColumn
                open={columnOpen}
                peeking={navPeek.isOpen}
                peekSurfaceProps={navPeek.surfaceProps}
                onPeekDismiss={navPeek.close}
              >
                <ContextualSidebar />
              </SidebarNavColumn>
            </Suspense>
          </ErrorBoundary>
        )}

        <div className={cn('relative flex h-full min-w-0 flex-1 flex-col overflow-hidden', appChromeClass)}>
          {!chromeless && (
          <GlobalHeader
            navOpen={columnOpen}
            onToggleNav={toggleNav}
            peeking={navPeek.isOpen}
            peekTriggerProps={navPeek.triggerProps}
          />
          )}
          <main className={cn(chromeless ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden' : appContentShellClass)}>
            {/* The route's own sidebar rides HERE, beside the workspace — one wrapper for every route, benches included. */}
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
        <Suspense fallback={null}>
          <GlobalDesktopSkuScanner />
        </Suspense>
        {drawerOverlay}
      </div>
    );
  }

  // (The `mobileRouteRestricted` blank that used to sit here is gone:
  return null;
}
