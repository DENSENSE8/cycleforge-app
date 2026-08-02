'use client';

import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { motion } from '@/design-system/motion';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import { ChevronRight } from '@/components/Icons';
import { useHasSidebarContext } from '@/components/sidebar/useHasSidebarContext';
import {
  CONTEXT_PANEL_COLLAPSE,
  CONTEXT_PANEL_COLLAPSE_STRIP_CLASS,
  CONTEXT_PANEL_COLUMN_CLASS,
  CONTEXT_PANEL_HOST_CLASS,
  CONTEXT_PANEL_RESIZE,
} from '@/components/sidebar/context-panel-column';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { HorizontalEdgeResizeHandle } from '@/design-system/components/HorizontalEdgeResizeHandle';
import { framerTransition } from '@/design-system/foundations/motion-framer';
import { useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { useHorizontalEdgeResize } from '@/design-system/hooks';
import { IconButton } from '@/design-system/primitives';
import {
  contextRailCostPx,
  getRightRailFrame,
  getServerRightRailFrame,
  setRightRailContextRail,
  subscribeRightRailFrame,
} from '@/lib/right-rail/frame';
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
 * {@link useHorizontalEdgeResize} + {@link HorizontalEdgeResizeHandle}; width
 * persists in localStorage ({@link CONTEXT_PANEL_RESIZE}). Collapse via
 * `onCollapse` on that handle ({@link CONTEXT_PANEL_COLLAPSE}) — width-drawer
 * to 0 + slim expand strip. One shared preference across routes.
 *
 * Renders `children` untouched when the route has no panel, so a panel-less
 * surface still reserves nothing.
 */
export function ContextPanelLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Two families, one question: station benches (scan bar + rail) and classic
  // routes (picker / feed) both mount their panel here now.
  const hasPanel = useHasSidebarContext() || isStationSurfaceRoute(pathname);
  // Every mounted context rail shares Unbox's resize + collapse grammar.
  // Hooks must run unconditionally (hasPanel flips on navigation).
  const { width, edgeHandleProps, isDragging } = useHorizontalEdgeResize({
    storageKey: CONTEXT_PANEL_RESIZE.storageKey,
    defaultWidth: CONTEXT_PANEL_RESIZE.defaultWidthPx,
    minWidth: CONTEXT_PANEL_RESIZE.minWidthPx,
    maxWidthPad: CONTEXT_PANEL_RESIZE.maxWidthPadPx,
    enabled: hasPanel,
    edge: 'trailing',
    label: 'Resize sidebar',
    testId: 'context-panel-resize',
  });
  const [collapsed, setCollapsed] = useLocalStorage(
    CONTEXT_PANEL_COLLAPSE.storageKey,
    false,
  );

  // Publish what this rail would COST IF OPEN — never a measurement of the
  // current DOM. The push resolver has to be able to ask "what would I get back
  // by parking it", which is unanswerable from a width that is already 0.
  useEffect(() => {
    setRightRailContextRail({
      railCostOpenPx: hasPanel ? contextRailCostPx(width) : 0,
      railOperatorCollapsed: collapsed,
    });
  }, [hasPanel, width, collapsed]);

  // The right-rail push may PARK this rail to make room. That is an EPHEMERAL
  // MASK over the operator's own preference, never a write to it: `setCollapsed`
  // is not called from here, so closing the inspector restores the rail to
  // whatever the operator had chosen — and a stale `context-panel-collapsed` in
  // localStorage can never be a side effect of opening a record.
  const { parkRail } = useSyncExternalStore(
    subscribeRightRailFrame,
    getRightRailFrame,
    getServerRightRailFrame,
  );

  const isCollapsed = hasPanel && (collapsed || parkRail);
  const transition = useMotionTransition(framerTransition.sidebarNavColumnMount);

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
          placement="outset"
          onCollapse={() => setCollapsed(true)}
        />
      ) : null}
    </>
  );

  return (
    <div className={cn(CONTEXT_PANEL_HOST_CLASS, 'relative')}>
      {/* The strip is the OPERATOR's restore control, so it renders only for a
          collapse they chose. A push-park renders none: the rail returns on its
          own when the panel closes, and a restore button that cannot restore
          (the mask would immediately re-apply) is worse than no button. That is
          also why a push-park costs 0 in `resolveRightRailFrame`, not 32 — the
          arithmetic matches what actually renders. */}
      {isCollapsed && collapsed ? (
        <div
          className={CONTEXT_PANEL_COLLAPSE_STRIP_CLASS}
          data-context-panel-collapsed
        >
          <HoverTooltip label="Show sidebar" asChild>
            <IconButton
              size="sm"
              tone="neutral"
              ariaLabel="Show sidebar"
              icon={<ChevronRight className="h-4 w-4" />}
              onClick={() => setCollapsed(false)}
              data-testid="context-panel-expand"
            />
          </HoverTooltip>
        </div>
      ) : null}

      {/* `data-context-panel` is the panel's identity hook, so a test can ask
          "did the route's rail render?" without keying off its width class. */}
      <motion.div
        className={cn(
          CONTEXT_PANEL_COLUMN_CLASS,
          // Outset grip sits outside the card; clip content on an inner shell
          // so the pill is not sheared by `overflow-hidden`.
          'overflow-visible',
          isCollapsed && 'pointer-events-none m-0 border-0 opacity-0',
        )}
        data-context-panel
        data-collapsed={isCollapsed ? 'true' : 'false'}
        initial={false}
        animate={{ width: isCollapsed ? 0 : width }}
        transition={transition}
        // Collapsed column stays mounted so the scan session does not remount
        // on expand — same latch idiom as SidebarNavColumn.
        inert={isCollapsed || undefined}
      >
        {panelBody}
      </motion.div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
