'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { motion, motionRole } from '@/design-system/motion';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import { useHasSidebarContext } from '@/components/sidebar/useHasSidebarContext';
import {
  CONTEXT_PANEL_COLLAPSE,
  CONTEXT_PANEL_COLUMN_CLASS,
  CONTEXT_PANEL_HOST_CLASS,
  CONTEXT_PANEL_RESIZE,
} from '@/components/sidebar/context-panel-column';
import {
  ContextPanelCollapseProvider,
  useContextPanelCollapse,
} from '@/components/sidebar/context-panel-collapse-context';
import {
  CollapseStripMruPins,
  CollapseStripScanCell,
  LeftDockCollapseStrip,
} from '@/components/sidebar/tech/left-dock-toggle';
import { HorizontalEdgeResizeHandle } from '@/design-system/components/HorizontalEdgeResizeHandle';
import { useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import {
  EDGE_RESIZE_COLLAPSE_SLACK_PX,
  useHorizontalEdgeResize,
} from '@/design-system/hooks';
import {
  contextRailCostPx,
  getStationPushActive,
  getStationPushDesiredWidthPx,
  setRightRailContextRail,
  subscribeRightRailFrame,
} from '@/lib/right-rail/frame';
import {
  applyStationContextDelta,
  getServerStationCoupled,
  getStationCoupled,
  isStationDualRailCouplingActive,
  subscribeStationCoupled,
} from '@/lib/right-rail/station-dual-rail';
import { useLocalStorage } from '@/hooks';
import { isStationSurfaceRoute } from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';

// Kept lazy, exactly as they were when this mounted from the app shell: the
// dispatcher code-splits every route panel behind it, so a shell-chunk static
// import here would pull each feature's graph into the shared bundle
// (`.claude/rules/build-gotchas.md` → bundle altitude).
const SidebarContextPanel = dynamic(
  () => import('@/components/sidebar/SidebarContextPanel').then((m) => m.SidebarContextPanel),
  { ssr: false },
);

/**
 * THE left context-sidebar wrapper — mounts a route's OWN sidebar beside its
 * workspace. MasterNav / `SidebarNavColumn` is a separate push spine; this is
 * the content-region rail card only.
 *
 * This is the shape the station benches always had — scan bar + recents rail as
 * a card in the content region — generalized to every route that has a context
 * panel. It replaced the nav-aside mount, where a route's rail was a *body of
 * the navigator*: `MasterNav` chose between "the page list" and "this route's
 * sidebar", so the two surfaces shared one column and had to fight over it.
 *
 * Why it is a wrapper and not a slot in the nav:
 *
 * - **A rail is part of the page, not part of the navigator.** Products' picker
 *   and Unbox's recents rail are the surface the operator works from; putting
 *   them inside the nav made them disappear (or get painted over) the moment the
 *   page list opened.
 * - **It leaves exactly one left-edge surface.** With the rails out of the aside,
 *   the spine no longer lands on top of anything, which is what let the Media
 *   library — a route with no rail at all — have the page list paint straight
 *   over its photo grid.
 * - **One shape, one set of tokens.** Every route now reads as
 *   `[rail card] [workspace]` on the canvas ground plane, instead of station
 *   routes doing that and classic routes doing something else.
 *
 * Every mounted context rail is drag-resizable on the trailing edge via
 * {@link useHorizontalEdgeResize} + {@link HorizontalEdgeResizeHandle}
 * (`placement="inset"` — paint is the panel's own `border-r` hairline, not an
 * outset twin to the right of the seam); width persists in localStorage
 * ({@link CONTEXT_PANEL_RESIZE}). Collapse via sash-top `onCollapse` on that
 * handle **or** drag-past-min (`onCollapseBeyondMin`) **or** the filter-bar
 * trailing {@link RailFilterCollapseButton} — all write
 * {@link CONTEXT_PANEL_COLLAPSE} (width-drawer to 0 + slim expand strip). One
 * shared preference across routes.
 *
 * Renders `children` untouched when the route has no panel, so a panel-less
 * surface still reserves nothing.
 */
export function ContextPanelLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Two families, one question: station benches (scan bar + rail) and classic
  // routes (picker / feed) both mount their panel here now.
  const hasPanel = useHasSidebarContext() || isStationSurfaceRoute(pathname);
  const stationSurface = isStationSurfaceRoute(pathname);
  // Collapse preference before resize so drag-past-min can write the same key.
  const [collapsed, setCollapsed] = useLocalStorage(
    CONTEXT_PANEL_COLLAPSE.storageKey,
    false,
  );
  // Station Displays push — re-render when frame mode/cap flips (opening
  // Displays switches centerFloor 784→0 and changes capPx). Snapshot is the
  // live stationPushActive flag for dual-rail coupling.
  const stationPushActive = useSyncExternalStore(
    subscribeRightRailFrame,
    getStationPushActive,
    () => false,
  );

  // Every mounted context rail shares Unbox's resize + collapse grammar.
  // Hooks must run unconditionally (hasPanel flips on navigation).
  const { width, setWidth, edgeHandleProps, isDragging } = useHorizontalEdgeResize({
    storageKey: CONTEXT_PANEL_RESIZE.storageKey,
    defaultWidth: CONTEXT_PANEL_RESIZE.defaultWidthPx,
    minWidth: CONTEXT_PANEL_RESIZE.minWidthPx,
    maxWidthPad: stationSurface
      ? CONTEXT_PANEL_RESIZE.stationMaxWidthPadPx
      : CONTEXT_PANEL_RESIZE.maxWidthPadPx,
    enabled: hasPanel,
    edge: 'trailing',
    label: 'Resize sidebar',
    testId: 'context-panel-resize',
    collapseBelowPx:
      CONTEXT_PANEL_RESIZE.minWidthPx - EDGE_RESIZE_COLLAPSE_SLACK_PX,
    onCollapseBeyondMin: () => setCollapsed(true),
  });

  // Publish what this rail would COST IF OPEN — never a measurement of the
  // current DOM. Skip mid-drag publishes so the park ladder does not tween on
  // every sash pixel; dual-rail coupling passes live widths into
  // {@link applyStationContextDelta} instead of reading the frame bus.
  const publishedCostRef = useRef<{ cost: number; collapsed: boolean } | null>(null);
  useEffect(() => {
    if (!isDragging) {
      const cost = hasPanel ? contextRailCostPx(width) : 0;
      const prev = publishedCostRef.current;
      if (!prev || prev.cost !== cost || prev.collapsed !== collapsed) {
        publishedCostRef.current = { cost, collapsed };
        setRightRailContextRail({
          railCostOpenPx: cost,
          railOperatorCollapsed: collapsed,
        });
      }
    }
  }, [hasPanel, width, collapsed, isDragging]);

  // Inverse-couple on station surfaces while Displays push is open: context
  // sash → Displays moves by −Δ. Desk routes keep solo CONTEXT_PANEL_RESIZE.
  const dragWidthRef = useRef(width);
  useEffect(() => {
    if (!stationSurface || !stationPushActive || collapsed || !isDragging) {
      dragWidthRef.current = width;
      return;
    }
    const delta = width - dragWidthRef.current;
    dragWidthRef.current = width;
    if (delta === 0 || !isStationDualRailCouplingActive()) return;
    const next = applyStationContextDelta(delta, {
      leftPx: width - delta,
      displaysPx: getStationPushDesiredWidthPx(),
    });
    if (next && next.leftPx !== width) {
      setWidth(next.leftPx);
      dragWidthRef.current = next.leftPx;
    }
  }, [
    width,
    isDragging,
    stationSurface,
    stationPushActive,
    collapsed,
    setWidth,
  ]);

  // Peer Displays sash wrote context width — sync (not while we drag).
  const coupled = useSyncExternalStore(
    subscribeStationCoupled,
    getStationCoupled,
    getServerStationCoupled,
  );
  useEffect(() => {
    if (!coupled || coupled.source !== 'displays' || isDragging || collapsed) return;
    if (!stationSurface || !stationPushActive) return;
    if (coupled.leftPx === width) return;
    setWidth(coupled.leftPx);
  }, [
    coupled,
    isDragging,
    collapsed,
    stationSurface,
    stationPushActive,
    width,
    setWidth,
  ]);

  // Collapse is operator-owned only. Opening a right-edge panel must NOT mask
  // this rail — both stay open and the center hugs `MIN_WORK_SURFACE_PX` /
  // the station workbench lock while the right panel's resize cap shrinks.
  const isCollapsed = hasPanel && collapsed;
  // `motionRole.push.rail` — TRANSITION ONLY. This column animates its own
  // width keyframes inline rather than mounting a presence shape, so it takes
  // the role's physics without pretending to have the role's presence.
  // Live drag / settled open: duration 0. Collapse open-close: tween.
  const railTransition = useMotionTransition(motionRole.push.rail.transition);
  const [collapseSettled, setCollapseSettled] = useState(!isCollapsed);
  useEffect(() => {
    if (isCollapsed) setCollapseSettled(false);
  }, [isCollapsed]);
  const widthTransition =
    isDragging || (!isCollapsed && collapseSettled)
      ? { duration: 0 }
      : railTransition;

  if (!hasPanel) return <>{children}</>;

  const panelBody = (
    <>
      {/* The rail degrades alone. It carried an `ErrorBoundary` when it lived
          in the nav aside, and moving it into the content region must not
          quietly turn a throwing picker into a blank page. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[inherit]"> {/* ds-allow-radius: clip shell inherits the panel card radius */}
        <ErrorBoundary
          label="context-panel"
          fallback={(_e, reset) => (
            <div className="m-3 rounded-lg border border-dashed border-rose-200 bg-rose-50 px-3 py-4 text-center">
              <p className="text-role-caption font-semibold text-rose-700">Sidebar unavailable</p>
              <p className="mt-1 text-role-eyebrow uppercase tracking-widest text-rose-500">
                The rest of the page still works
              </p>
              <button
                type="button"
                onClick={reset}
                className="ds-raw-button mt-3 rounded-lg bg-surface-card px-3 py-1.5 text-role-caption font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50"
              >
                Retry
              </button>
            </div>
          )}
        >
          <SidebarContextPanel />
        </ErrorBoundary>
      </div>
      {!isCollapsed ? (
        <HorizontalEdgeResizeHandle
          edgeHandleProps={edgeHandleProps}
          isDragging={isDragging}
          edge="trailing"
          placement="inset"
          tooltipLabel="Resize"
          onCollapse={() => setCollapsed(true)}
          collapseLabel="Hide sidebar"
        />
      ) : null}
    </>
  );

  return (
    <ContextPanelCollapseProvider collapse={() => setCollapsed(true)}>
      <div className={cn(CONTEXT_PANEL_HOST_CLASS, 'relative')}>
        {/* The strip is the OPERATOR's restore control — only when they collapsed
            the rail. Mid-strip MRU pins come from the open rail via
            {@link usePublishCollapsePins}. */}
        {isCollapsed ? (
          <ContextPanelCollapseStripSlot onExpand={() => setCollapsed(false)} />
        ) : null}

        {/* `data-context-panel` is the panel's identity hook, so a test can ask
            "did the route's rail render?" without keying off its width class. */}
        <motion.div
          className={cn(
            CONTEXT_PANEL_COLUMN_CLASS,
            // Inset sash lives inside the card — clip is safe; the inner shell
            // still owns the feed scrollport.
            isCollapsed && 'pointer-events-none m-0 border-0 opacity-0',
          )}
          data-context-panel
          data-collapsed={isCollapsed ? 'true' : 'false'}
          initial={false}
          animate={{ width: isCollapsed ? 0 : width }}
          transition={widthTransition}
          onAnimationComplete={() => {
            if (!isCollapsed) setCollapseSettled(true);
          }}
          // Collapsed column stays mounted so the scan session does not remount
          // on expand — same latch idiom as SidebarNavColumn.
          inert={isCollapsed || undefined}
        >
          {panelBody}
        </motion.div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </ContextPanelCollapseProvider>
  );
}

/** Expand strip under the provider — mini scan + mid-strip MRU pins. */
function ContextPanelCollapseStripSlot({ onExpand }: { onExpand: () => void }) {
  const api = useContextPanelCollapse();
  const collapseMru = api?.collapseMru ?? null;
  const collapseScan = api?.collapseScan ?? null;
  return (
    <LeftDockCollapseStrip
      onExpand={onExpand}
      label="Show sidebar"
      testId="context-panel-expand"
      hostDataAttrs={{ 'data-context-panel-collapsed': true }}
    >
      {collapseScan ? <CollapseStripScanCell scan={collapseScan} /> : null}
      {collapseMru ? (
        <CollapseStripMruPins
          pins={collapseMru.pins}
          totalCount={collapseMru.totalCount}
          onExpand={onExpand}
        />
      ) : null}
    </LeftDockCollapseStrip>
  );
}
