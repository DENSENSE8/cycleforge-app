'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import { useHasSidebarContext } from '@/components/sidebar/useHasSidebarContext';
import { useIsRaillessOrderFeed } from '@/components/sidebar/useIsRaillessOrderFeed';
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
import { useContextPanelToggleHotkey } from '@/components/sidebar/context-panel-toggle-hotkey';
import {
  CollapseStripMruPins,
  CollapseStripScanCell,
  LeftDockCollapseStrip,
} from '@/components/sidebar/tech/left-dock-toggle';
import { HorizontalEdgeResizeHandle } from '@/design-system/components/HorizontalEdgeResizeHandle';
import {
  EDGE_RESIZE_COLLAPSE_SLACK_PX,
  useHorizontalEdgeResize,
} from '@/design-system/hooks';
import {
  contextRailCostPx,
  getRightRailFrame,
  getServerRightRailFrame,
  getStationPushActive,
  requestStationCloseDisplays,
  setRightRailContextRail,
  setStationContextSashArmed,
  subscribeRightRailFrame,
  subscribeStationFarRailRequest,
} from '@/lib/right-rail/frame';
import { useLocalStorage } from '@/hooks';
import { isStationSurfaceRoute } from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';

// Kept lazy, exactly as they were when this mounted from the app shell: the
// dispatcher code-splits every route panel behind it, so a shell-chunk static
// import here would pull each feature's graph into the shared bundle
// (`.claude/rules/build-gotchas.md` → bundle altitude).
//
// `ssr: false` was REMOVED (2026-08-12). It was never what bought the bundle
// split — `dynamic()` code-splits the client chunk either way — it only meant
// the rail could not exist in the server HTML. On a scan station the recents
// rail is the first thing the operator reads (the carton they were last on,
// already selected), so a rail that cannot server-render cannot paint first no
// matter how fast its data is; with the seed in the HydrationBoundary it now
// renders straight from the seeded cache.
const SidebarContextPanel = dynamic(
  () => import('@/components/sidebar/SidebarContextPanel').then((m) => m.SidebarContextPanel),
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
 * ({@link CONTEXT_PANEL_RESIZE}). Collapse via drag-past-min
 * (`onCollapseBeyondMin`), the filter-bar trailing
 * {@link RailFilterCollapseButton}, **or ⌘/Ctrl+B**
 * ({@link useContextPanelToggleHotkey}) — all write {@link CONTEXT_PANEL_COLLAPSE}
 * (width-drawer to 0 + slim expand strip). One shared preference across routes.
 * The resize sash is drag-only (no sash-top collapse chevron). MasterNav
 * spine (`SidebarNavColumn`) shares this exact grammar too now (2026-08-16) —
 * its own {@link useHorizontalEdgeResize} + {@link HorizontalEdgeResizeHandle}
 * pair, a separate storage key (`SIDEBAR_SPINE_RESIZE`), open via click OR
 * drag-past-min collapse OR the GlobalHeader toggle. Two altitudes, one
 * splitter contract — no reason left for the spine to be the one nav surface
 * that doesn't drag.
 *
 * Renders `children` untouched when the route has no panel, so a panel-less
 * surface still reserves nothing.
 */
export function ContextPanelLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Two families, one question: station benches (scan bar + rail) and classic
  // routes (picker / feed) both mount their panel here now — EXCEPT the To-ship
  // order feed, which runs rail-less (Pattern E) so the center reclaims the
  // column. `isRaillessOrderFeedSurface` / `outbound-rail-dedup.guard.test.ts`.
  const railless = useIsRaillessOrderFeed();
  const hasPanel =
    (useHasSidebarContext() || isStationSurfaceRoute(pathname)) && !railless;
  const stationSurface = isStationSurfaceRoute(pathname);
  // Collapse preference before resize so drag-past-min can write the same key.
  const [collapsed, setCollapsed] = useLocalStorage(
    CONTEXT_PANEL_COLLAPSE.storageKey,
    false,
  );
  const collapse = useCallback(() => setCollapsed(true), [setCollapsed]);
  const expand = useCallback(() => setCollapsed(false), [setCollapsed]);
  const toggle = useCallback(
    () => setCollapsed((prev) => !prev),
    [setCollapsed],
  );
  // Single owner — the open panel stays mounted (inert) while parked, so the
  // chord cannot live on both collapse + expand click hosts.
  useContextPanelToggleHotkey(toggle, hasPanel);
  // Stage 3: a Displays-sash overshoot (right panel dragged past its cap — this
  // rail already at its min) parks THIS rail so Displays keeps growing. Ref so
  // the subscription never re-binds on `collapse` churn.
  const collapseRef = useRef(collapse);
  collapseRef.current = collapse;
  useEffect(
    () =>
      subscribeStationFarRailRequest((req) => {
        if (req === 'collapse-context') collapseRef.current();
      }),
    [],
  );
  // Station Displays push — the live in-flow flag + the reactive frame snapshot
  // (its `stationContextCapPx` is this rail's LOCAL sash clamp).
  const stationPushActive = useSyncExternalStore(
    subscribeRightRailFrame,
    getStationPushActive,
    () => false,
  );
  const frame = useSyncExternalStore(
    subscribeRightRailFrame,
    getRightRailFrame,
    getServerRightRailFrame,
  );

  // While an in-flow Displays column is open, cap the context sash at
  // `frame − displays − 720` (the frame store's `stationContextCapPx`). This is a
  // LOCAL clamp — the sash resizes ONLY this rail and the elastic center absorbs
  // the change; Displays is never written (no coupling). The sash simply STOPS
  // at the center floor. Off a station push the sash keeps its normal
  // viewport-pad reach.
  const contextStationMaxPx =
    stationSurface && stationPushActive && !collapsed
      ? frame.stationContextCapPx
      : undefined;

  // Every mounted context rail shares Unbox's resize + collapse grammar.
  // Hooks must run unconditionally (hasPanel flips on navigation).
  const { width, edgeHandleProps, isDragging, collapseArmed, overshootArmed } = useHorizontalEdgeResize({
    storageKey: CONTEXT_PANEL_RESIZE.storageKey,
    defaultWidth: CONTEXT_PANEL_RESIZE.defaultWidthPx,
    minWidth: CONTEXT_PANEL_RESIZE.minWidthPx,
    maxWidthPad: stationSurface
      ? CONTEXT_PANEL_RESIZE.stationMaxWidthPadPx
      : CONTEXT_PANEL_RESIZE.maxWidthPadPx,
    maxWidth: contextStationMaxPx,
    enabled: hasPanel,
    edge: 'trailing',
    label: 'Resize sidebar',
    testId: 'context-panel-resize',
    collapseBelowPx:
      CONTEXT_PANEL_RESIZE.minWidthPx - EDGE_RESIZE_COLLAPSE_SLACK_PX,
    onCollapseBeyondMin: collapse,
    // Stage 3 (reverse): dragging the rail past its cap — Displays already at its
    // min — closes Displays so the rail (and center) keep growing. Only when an
    // in-flow Displays column is actually open to close.
    onOvershootMax:
      contextStationMaxPx != null ? requestStationCloseDisplays : undefined,
    overshootBeyondPx:
      contextStationMaxPx != null
        ? contextStationMaxPx + EDGE_RESIZE_COLLAPSE_SLACK_PX
        : undefined,
  });

  // Publish what this rail would COST IF OPEN — never a measurement of the
  // current DOM. Desk inspectors freeze this mid-drag (publish on release only),
  // but on a station surface with an open Displays we publish LIVE during a
  // context-sash drag too: as the rail grows, the frame store's tight Displays
  // cap shrinks and Displays yields toward its min (the cascade's symmetric
  // direction — the center absorbs first, then Displays yields).
  const publishedCostRef = useRef<{ cost: number; collapsed: boolean } | null>(null);
  const publishLiveDuringDrag = stationSurface && stationPushActive && !collapsed;
  useEffect(() => {
    if (isDragging && !publishLiveDuringDrag) return;
    const cost = hasPanel ? contextRailCostPx(width) : 0;
    const prev = publishedCostRef.current;
    if (!prev || prev.cost !== cost || prev.collapsed !== collapsed) {
      publishedCostRef.current = { cost, collapsed };
      setRightRailContextRail({
        railCostOpenPx: cost,
        railOperatorCollapsed: collapsed,
      });
    }
  }, [hasPanel, width, collapsed, isDragging, publishLiveDuringDrag]);

  // Relay the reverse Stage-3 arm to the far DISPLAYS column so it lights its own
  // seam warning. Only the OVERSHOOT arm (close Displays) relays — the collapse
  // arm (park THIS rail) is self-contained and lights this rail's own seam below.
  // `overshootArmed` can only be true on a station surface where a Displays is
  // open (that is the only case its `onOvershootMax` is wired), so this publishes
  // `false` everywhere else — a no-op after the store dedupes.
  useEffect(() => {
    setStationContextSashArmed(overshootArmed);
    return () => setStationContextSashArmed(false);
  }, [overshootArmed]);

  // No cross-rail coupling (Option A). This sash resizes ONLY this rail; the
  // elastic center absorbs the change and the Displays column is untouched. The
  // rail paints from its own local `width`, and `contextStationMaxPx` stops the
  // drag at the center floor — the sash never reaches across to the far column.

  // Collapse is operator-owned on desk surfaces. On a station surface with an
  // open Displays, the frame store may request `collapse-context` so Displays
  // stays open on a small width (parks THIS rail rather than overflowing /
  // overlay-hiding Displays). Live sash drag paints every frame from local `width`.
  const isCollapsed = hasPanel && collapsed;
  // Park/restore snaps — same as Station Displays (no `motionRole.push.rail`
  // width tween). Live sash drag paints every frame from local `width`.

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
        // The flash marks the pane about to DISAPPEAR — so this rail lights only
        // when IT is the one collapsing: its own drag-past-min park
        // (`collapseArmed`), or the Displays sash parking it
        // (`stationDisplaysSashArmed`). NOT `overshootArmed` — that is this rail's
        // sash closing DISPLAYS, so the flash belongs to Displays, not here.
        <HorizontalEdgeResizeHandle
          edgeHandleProps={edgeHandleProps}
          isDragging={isDragging}
          edge="trailing"
          placement="inset"
          armed={collapseArmed || frame.stationDisplaysSashArmed}
          tooltipLabel="Resize"
        />
      ) : null}
    </>
  );

  return (
    <ContextPanelCollapseProvider
      collapse={collapse}
      expand={expand}
      toggle={toggle}
    >
      <div className={cn(CONTEXT_PANEL_HOST_CLASS, 'relative')}>
        {/* The strip is the OPERATOR's restore control — only when they collapsed
            the rail. Mid-strip MRU pins come from the open rail via
            {@link usePublishCollapsePins}. */}
        {isCollapsed ? (
          <ContextPanelCollapseStripSlot onExpand={expand} />
        ) : null}

        {/* `data-context-panel` is the panel's identity hook, so a test can ask
            "did the route's rail render?" without keying off its width class.
            Width snaps (no layout animation) — Displays in-flow twin. */}
        <div
          className={cn(
            CONTEXT_PANEL_COLUMN_CLASS,
            // Inset sash lives inside the card — clip is safe; the inner shell
            // still owns the feed scrollport.
            isCollapsed && 'pointer-events-none m-0 border-0 opacity-0',
          )}
          data-context-panel
          data-collapsed={isCollapsed ? 'true' : 'false'}
          style={{ width: isCollapsed ? 0 : width }}
          // Collapsed column stays mounted so the scan session does not remount
          // on expand — same latch idiom as SidebarNavColumn.
          inert={isCollapsed || undefined}
        >
          {panelBody}
        </div>
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
