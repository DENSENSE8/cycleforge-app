'use client';

/** RightRailHost — THE right details-panel wrapper / ONE owner of the right-edge slot. */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
import { ChevronLeft, Maximize2, Minimize2, X } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { usePanelStoreKeyboard } from '@/hooks/usePanelStoreKeyboard';
import { closeRightPanel } from '@/lib/right-rail/close';
import { usePanelDraft, usePanelStore } from '@/lib/right-rail/panel-store';
import {
  motionDuration,
  motionPresence,
  motionTransition,
  motionBezier,
} from '@/design-system/foundations/motion-presets';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { HorizontalEdgeResizeHandle } from '@/design-system/components/HorizontalEdgeResizeHandle';
import {
  useAnyOverlayOpen,
  useBodyScrollLock,
  useHorizontalEdgeResize,
} from '@/design-system/hooks';
import { STATION_CHROME_ROW_FACE } from '@/components/station/entity-context';
import { IconButton } from '@/design-system/primitives';
import { zIndex } from '@/design-system/tokens/z-index';
import { useLocalStorage } from '@/hooks';
import {
  DETAIL_INSPECTOR_COLLAPSE_EVENT,
  DETAIL_STACK_COLLAPSE,
  DETAIL_STACK_PUSH_COLUMN_CLASS,
  DETAIL_STACK_PUSH_STRIP_CLASS,
  DETAIL_STACK_RESIZE,
  detailStackAsideClassName,
  detailStackAsideElevatedClassName,
  detailStackAsideStyle,
  type DetailInspectorCollapseDetail,
  detailStackBackdropClassName,
  detailStackBackdropElevatedClassName,
  detailStackCollapseStripClassName,
  detailStackCollapseStripStyle,
  detailStackDismissLayerClassName,
  detailStackDismissLayerElevatedClassName,
} from '@/components/right-rail/DetailStackFrame';
import {
  getRightRailFrame,
  getServerRightRailFrame,
  setRightRailDemand,
  subscribeRightRailFrame,
} from '@/lib/right-rail/frame';
import {
  getRightRailTop,
  getRightRailTopSkipping,
  getServerRightRailTop,
  subscribeRightRail,
} from '@/lib/right-rail/store';
import { cn } from '@/utils/_cn';
import { ModeRegion } from '@/design-system/providers/ModeRegion';

/** The occupant's body is the rail's task-mode region: */
function RightRailOccupantBody({ node }: { node: ReactNode }) {
  const restored = usePanelDraft();
  return (
    <ModeRegion
      mode="triage"
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden p-0"
      data-right-rail-has-draft={restored != null ? '' : undefined}
    >
      {node}
    </ModeRegion>
  );
}

/** The singleton dismiss. */
function RightRailHostTrailingCluster({
  refused = false,
  maximized,
  onToggleMaximize,
}: {
  refused?: boolean;
  /** Omit both to paint close alone (overlay mode has no sash to widen). */
  maximized?: boolean;
  onToggleMaximize?: () => void;
}) {
  const canMaximize = onToggleMaximize != null;
  return (
    <div
      // `right-0`, not `right-2` (2026-08-19):
      className={cn(
        // ALWAYS two cells wide.
        'absolute right-0 top-0 flex w-14 items-stretch p-0 pointer-events-auto',
        STATION_CHROME_ROW_FACE,
      )}
      style={{ zIndex: zIndex.header + 1 }}
      data-right-rail-host-close-anchor
    >
      {!canMaximize ? <span className="h-full w-7 shrink-0" aria-hidden /> : null}
      {canMaximize ? (
        <HoverTooltip
          label={maximized ? 'Restore panel width' : 'Expand over the work surface'}
          asChild
        >
          <IconButton
            size="sm"
            tone="neutral"
            ariaLabel={maximized ? 'Restore panel width' : 'Expand over the work surface'}
            icon={
              maximized ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )
            }
            onClick={onToggleMaximize}
            data-testid="right-rail-host-fullscreen"
            className="h-full w-7 shrink-0 rounded-none active:scale-100"
          />
        </HoverTooltip>
      ) : null}
      <HoverTooltip
        label={refused ? 'Finishing — cancel to stop' : 'Hide right panel'}
        asChild
      >
        <IconButton
          size="sm"
          tone="neutral"
          ariaLabel="Hide right panel"
          icon={<X className="h-3.5 w-3.5" />}
          onClick={() => closeRightPanel()}
          disabled={refused}
          data-testid="right-rail-host-close"
          className="h-full w-7 shrink-0 rounded-none active:scale-100"
        />
      </HoverTooltip>
    </div>
  );
}

const BACKDROP_FADE = {
  duration: motionDuration.detailStackOverlayMount * 0.75,
  ease: motionBezier.easeOut,
} as const;

export function RightRailHost({ inline = true }: { inline?: boolean } = {}) {
  const occupancyTop = useSyncExternalStore(
    subscribeRightRail,
    getRightRailTop,
    getServerRightRailTop,
  );
  const lifecycle = usePanelStore();
  const skipId = lifecycle.dismissed ? lifecycle.activeView?.id ?? null : null;
  const top = skipId ? getRightRailTopSkipping(skipId) : occupancyTop;
  const frame = useSyncExternalStore(
    subscribeRightRailFrame,
    getRightRailFrame,
    getServerRightRailFrame,
  );
  const overlayPresence = useMotionPresence(motionPresence.detailStackOverlay);
  const overlayTransition = useMotionTransition(motionTransition.detailStackOverlayMount);

  const renderable = top && top.node != null ? top : null;
  const isElevated = !!renderable?.elevated;
  // Modality is a per-occupant contract (`RightRailPanel.modal`, default true).
  const isModal = renderable?.modal !== false;

  // The innermost open overlay owns Escape: while a popover / menu / cell editor
  // is up, Escape dismisses THAT, not the whole inspector underneath it.
  const overlayOpen = useAnyOverlayOpen();

  // Collapse state (localStorage) — read BEFORE the push/overlay decision, which depends on it:
  const [collapsed, setCollapsed] = useLocalStorage(
    DETAIL_STACK_COLLAPSE.storageKey,
    false,
  );
  useEffect(() => {
    const onCollapseChange = (event: Event) => {
      const detail = (event as CustomEvent<DetailInspectorCollapseDetail>).detail;
      if (!detail || typeof detail.collapsed !== 'boolean') return;
      setCollapsed(detail.collapsed);
    };
    window.addEventListener(DETAIL_INSPECTOR_COLLAPSE_EVENT, onCollapseChange);
    return () => window.removeEventListener(DETAIL_INSPECTOR_COLLAPSE_EVENT, onCollapseChange);
  }, [setCollapsed]);

  // Drag-to-resize + collapse, non-modal occupants only.
  const isResizable = !!renderable && !isModal;
  // Occupants that opt out of host park (Incoming Unbox-parity) ignore DETAIL_STACK_COLLAPSE / Band 3 parking — treat them as expanded even…
  const allowEdgeCollapse = renderable?.edgeCollapse !== false;
  const isCollapsed = isResizable && collapsed && allowEdgeCollapse;
  const showCollapsedStrip = renderable?.collapsedStrip !== false;

  // Whether THIS occupant pushes — the demand published to `resolveRightRailFrame` (below) AND the local render decision.
  const wantsPush =
    inline &&
    !!renderable &&
    !isModal &&
    renderable.push !== false &&
    !(isCollapsed && !showCollapsedStrip);
  // Push mode has nothing to lock: it covers nothing.
  const isPush = wantsPush;

  useBodyScrollLock(!!renderable && isModal && !isPush);
  // Every occupant goes through `closeRightPanel` (unmount + draft toast +
  // occupant teardown) so wedge listeners on the view die with it.
  usePanelStoreKeyboard();

  /** Maximize — in-flow sash widen that **covers the middle**. */
  const [maximized, setMaximized] = useState(false);
  const preMaxWidthRef = useRef<number | null>(null);
  const maximizeWidthPx = isPush && isResizable ? frame.coverPx : null;

  const { width, setWidth, edgeHandleProps, isDragging } = useHorizontalEdgeResize({
    storageKey: DETAIL_STACK_RESIZE.storageKey,
    defaultWidth: DETAIL_STACK_RESIZE.defaultWidthPx,
    minWidth: DETAIL_STACK_RESIZE.minWidthPx,
    maxWidthPad: maximized ? 0 : DETAIL_STACK_RESIZE.maxWidthPadPx,
    // In push mode the ceiling is derived from the frame (what the work surface must keep), not from the viewport pad — the pad stays as the…
    maxWidth: isPush ? (maximized ? frame.coverPx : frame.capPx) : undefined,
    enabled: isResizable,
    label: 'Resize details panel',
    testId: 'detail-inspector-resize',
  });

  // A live sash drag abandons the latch — the operator owns the width.
  useEffect(() => {
    if (!isDragging || !maximized) return;
    setMaximized(false);
    preMaxWidthRef.current = null;
  }, [isDragging, maximized]);

  // Losing the cap (overlay mode, non-resizable occupant) must not strand the
  // panel at a width the operator can no longer undo.
  useEffect(() => {
    if (maximizeWidthPx != null || !maximized) return;
    setMaximized(false);
    preMaxWidthRef.current = null;
  }, [maximizeWidthPx, maximized]);

  // Follow a live frame resize while maximized (left rail park / window size).
  useEffect(() => {
    if (!maximized || maximizeWidthPx == null) return;
    setWidth(maximizeWidthPx);
  }, [maximized, maximizeWidthPx, setWidth]);

  const toggleMaximize = useCallback(() => {
    if (maximizeWidthPx == null) return;
    if (maximized) {
      const restoreTo = preMaxWidthRef.current;
      preMaxWidthRef.current = null;
      setMaximized(false);
      if (restoreTo != null) setWidth(restoreTo);
      return;
    }
    preMaxWidthRef.current = width;
    setMaximized(true);
  }, [maximizeWidthPx, maximized, setWidth, width]);

  // Freeze `desiredWidthPx` while dragging so hosts that still publish desire
  // do not thrash on every pointer move; publish the final width on pointerup.
  const publishedDesireRef = useRef(width);
  if (!isDragging) publishedDesireRef.current = width;
  useEffect(() => {
    setRightRailDemand({
      wantsPush,
      desiredWidthPx: publishedDesireRef.current,
    });
  }, [wantsPush, width, isDragging]);
  // Release the claim on unmount so a route without a host cannot leave a stale
  // push demand in the frame store.
  useEffect(() => () => setRightRailDemand({ wantsPush: false, desiredWidthPx: width }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Invisible dismiss layer: non-modal + opt-in + not parked + OVERLAY only.
  // Under push it would be a `fixed inset-0` blanket over the very surface the
  // push exists to keep live.
  const showDismissLayer =
    !!renderable?.onClose &&
    !isModal &&
    !!renderable.closeOnOutsideClick &&
    !isCollapsed &&
    !isPush;
  const showModalBackdrop = !!renderable?.onClose && isModal && !isPush;

  const body = renderable?.node != null ? <RightRailOccupantBody node={renderable.node} /> : null;

  const showPush = isPush && !!renderable;
  const showOverlay = !isPush && !!renderable;
  const showHostClose = !!renderable && !isCollapsed;
  // Read the veto every render — it tracks a run that starts and ends while
  // the panel stays mounted.
  const closeRefused = top?.canClose ? !top.canClose() : false;
  const onHostDismiss = closeRightPanel;

  return (
    <>
      {/* ── PUSH: an in-flow column beside the work surface ─────────────── */}
      <>
        {showPush && isCollapsed && showCollapsedStrip ? (
          <div className={DETAIL_STACK_PUSH_STRIP_CLASS} data-detail-inspector-collapsed>
            <HoverTooltip label="Show details" asChild>
              <IconButton
                size="sm"
                tone="neutral"
                ariaLabel="Show details"
                icon={<ChevronLeft className="h-4 w-4" />}
                onClick={() => setCollapsed(false)}
                data-testid="detail-inspector-expand"
              />
            </HoverTooltip>
          </div>
        ) : null}
        {/* Instant width snap shared with push-column workspace hosts. */}
        {showPush && !isCollapsed ? (
          <aside
            role="region"
            aria-label={renderable?.ariaLabel ?? 'Details'}
            data-right-rail-column
            data-right-rail-mode="push"
            className={cn(DETAIL_STACK_PUSH_COLUMN_CLASS, 'p-0')}
            // The header+content column is `relative` and seven workspaces
            // mount `zIndex.panel` overlays inside it, so an in-flow column
            // with `z-index: auto` would paint under them.
            style={{
              width,
              zIndex: isElevated ? zIndex.detailStack : zIndex.panel,
            }}
          >
            {/* Drag ONLY — inset on the panel's own border-l seam. No
                `onCollapse` sash chevron (twins header `→|` / Band 3). */}
            <HorizontalEdgeResizeHandle
              edgeHandleProps={edgeHandleProps}
              isDragging={isDragging}
              edge="leading"
              placement="inset"
            />
            {showHostClose ? (
              <RightRailHostTrailingCluster
                refused={closeRefused}
                maximized={maximized}
                onToggleMaximize={maximizeWidthPx != null ? toggleMaximize : undefined}
              />
            ) : null}
            {body}
          </aside>
        ) : null}
      </>

      {/* ── OVERLAY: the historical fixed inset card ────────────────────── */}
      <AnimatePresence initial={false}>
        {showOverlay && (showModalBackdrop || showDismissLayer) ? (
          <motion.div
            key={`${renderable!.id}-backdrop`}
            role="presentation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={BACKDROP_FADE}
            onClick={overlayOpen ? undefined : onHostDismiss}
            className={
              showModalBackdrop
                ? isElevated
                  ? detailStackBackdropElevatedClassName
                  : detailStackBackdropClassName
                : isElevated
                  ? detailStackDismissLayerElevatedClassName
                  : detailStackDismissLayerClassName
            }
          />
        ) : null}
      </AnimatePresence>
      {showOverlay && isCollapsed && showCollapsedStrip ? (
        <div
          className={detailStackCollapseStripClassName(isElevated)}
          style={detailStackCollapseStripStyle()}
          data-detail-inspector-collapsed
        >
          <HoverTooltip label="Show details" asChild>
            <IconButton
              size="sm"
              tone="neutral"
              ariaLabel="Show details"
              icon={<ChevronLeft className="h-4 w-4" />}
              onClick={() => setCollapsed(false)}
              data-testid="detail-inspector-expand"
            />
          </HoverTooltip>
        </div>
      ) : null}
      <AnimatePresence mode="wait" initial={false}>
        {showOverlay && renderable ? (
          <motion.aside
            key={renderable.id}
            data-right-rail-mode="overlay"
            // Modal occupants keep the blocking dialog semantics.
            role={isModal ? 'dialog' : 'region'}
            aria-modal={isModal ? true : undefined}
            aria-label={renderable.ariaLabel ?? (isModal ? undefined : 'Details')}
            aria-hidden={isCollapsed || undefined}
            initial={overlayPresence.initial}
            animate={
              isCollapsed
                ? { ...overlayPresence.animate, opacity: 0 }
                : overlayPresence.animate
            }
            exit={overlayPresence.exit}
            transition={overlayTransition}
            style={{
              ...detailStackAsideStyle(isResizable ? width : undefined),
              ...(isCollapsed ? { width: 0, minWidth: 0, padding: 0, border: 'none' } : null),
            }}
            className={cn(
              isElevated ? detailStackAsideElevatedClassName : detailStackAsideClassName,
              // Inset grip paints on the panel seam; column may keep
              // overflow-hidden (DETAIL_STACK_ASIDE_SURFACE).
              isCollapsed && 'pointer-events-none opacity-0',
            )}
            // Collapsed aside stays mounted so the registrant does not remount
            // on expand — same latch idiom as ContextPanelLayout.
            inert={isCollapsed || undefined}
          >
            {isResizable && !isCollapsed ? (
              <HorizontalEdgeResizeHandle
                edgeHandleProps={edgeHandleProps}
                isDragging={isDragging}
                edge="leading"
                placement="inset"
              />
            ) : null}
            {showHostClose ? <RightRailHostTrailingCluster refused={closeRefused} /> : null}
            {body}
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </>
  );
}
