'use client';

/**
 * RightRailHost — THE right details-panel wrapper / ONE owner of the right-edge
 * slot. It renders exactly the top occupant of `lib/right-rail/store.ts`.
 *
 * ## Two contracts, one host
 *
 * **PUSH (desktop record inspectors).** A non-modal occupant is an **in-flow column**: a flex
 * sibling of `ContextPanelLayout`'s host inside `<main>` that claims its width
 * instantly (no layout tween), so the work surface reflows BESIDE it instead of
 * under it. This is the house ruling — "every resident edge PUSHES; nothing floats
 * over the work surface" (`source-of-truth.md` → Right-rail modality) — and it is
 * the Unbox Displays / context-rail recipe mirrored, not a new one:
 * `StationDisplaysPushColumn` and `ContextPanelLayout` both snap `style.width`
 * on open ↔ park; desk inspectors do the same. Live sash drag still paints every
 * frame.
 *
 * The card is the sizing element ON PURPOSE. The leading resize grip is
 * `placement="inset"` — hit sash inside the panel, 1px paint on the panel's
 * own `border-l` seam (the display hairline). Nothing hangs into the work
 * surface; Unbox Displays is the golden twin. Left context rail still uses
 * `outset` (different edge).
 *
 * **OVERLAY (explicit contracts only).** Modal / intake occupants, ambient
 * assistant, station-edge opt-outs, chromeless routes, and mobile keep the
 * fixed overlay shell (presence + backdrop fade). Width pressure alone NEVER
 * turns a desktop resident inspector into a floating rounded card.
 *
 * ## Stable occupant id, no exit→empty→enter
 *
 * The push column mounts once while an occupant is present. Record→record swaps
 * keep a stable id (`detail:order`, …) so the column never remounts and content
 * updates in place — the same instant cut Unbox Displays uses when a leaf swaps.
 *
 * ## Singleton close
 *
 * The host paints one `X` at the top-RIGHT (ruled 2026-08-19, replacing the
 * top-left `→|`). Click / Esc / scrim all fire the ONE closer,
 * `closeRightPanel()` (`lib/right-rail/close.ts`) — which caches `draftData`,
 * parks the occupant, toasts "Draft saved." with Resume, AND runs the
 * occupant's own `onClose` teardown (clear a selection, drop a URL param).
 * Child views must not mount a second close anywhere — not a header twin and
 * not a footer `→|` beside a submit CTA. Mod+Shift+R resumes while the toast
 * is armed.
 *
 * WHY THE CORNER MOVED. The top-LEFT corner is where every panel's own chrome
 * starts — the index Back, the column-display `▦`, the contextual icon strip —
 * so the singleton close was permanently occupying the one cell each occupant
 * wanted first, and each of them had to reserve a spacer for a control they do
 * not own. The trailing corner is empty on every occupant, and it is where a
 * dismiss is reached for without looking. `DeskRailChromeRow` therefore
 * reserves its slot at the TRAILING end; the leading edge is the occupant's.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
import { ChevronLeft, Maximize2, Minimize2, X } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { usePanelStoreKeyboard } from '@/hooks/usePanelStoreKeyboard';
import { closeRightPanel } from '@/lib/right-rail/close';
import { usePanelDraft, usePanelStore } from '@/lib/right-rail/panel-store';
import {
  framerDuration,
  framerPresence,
  framerTransition,
  motionBezier,
} from '@/design-system/foundations/motion-framer';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { HorizontalEdgeResizeHandle } from '@/design-system/components/HorizontalEdgeResizeHandle';
import {
  useAnyOverlayOpen,
  useBodyScrollLock,
  useEscapeClose,
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
  assistantDockAsideClassName,
  assistantDockAsideStyle,
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

function RightRailOccupantBody({ node }: { node: ReactNode }) {
  const restored = usePanelDraft();
  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden p-0"
      data-right-rail-has-draft={restored != null ? '' : undefined}
    >
      {node}
    </div>
  );
}

/**
 * The singleton dismiss. `refused` mirrors the occupant's own `canClose` veto
 * so the control READS refused instead of going inert under the pointer — the
 * occupants that veto (both sync dialogs) already disable their own buttons
 * mid-run, and a host X that stayed live while doing nothing is the same lie
 * from the other side.
 */
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
      // `right-0`, not `right-2` (2026-08-19): dismiss is the control an
      // operator throws the pointer at without looking, and a flush corner is
      // an infinite-width target — 8px of inset turns it back into a 28px one.
      // The chrome row reserves exactly this cell (`pr-0` + a `w-7` spacer), so
      // nothing scrolls under it.
      className={cn(
        // ALWAYS two cells wide. The occupant reserves a fixed `w-14`
        // (RIGHT_RAIL_HOST_CLOSE_SLOT_CLASS) and cannot know whether this
        // panel is a resizable push occupant, so a `w-7` cluster here would
        // leave 28px of dead gap on every overlay/non-resizable occupant.
        // When maximize is unavailable its cell renders as an empty spacer.
        'absolute right-0 top-0 z-header flex w-14 items-stretch p-0',
        STATION_CHROME_ROW_FACE,
      )}
      data-right-rail-host-close-anchor
    >
      {!canMaximize ? <span className="h-full w-7 shrink-0" aria-hidden /> : null}
      {canMaximize ? (
        <HoverTooltip
          label={maximized ? 'Restore panel width' : 'Maximize panel'}
          asChild
        >
          <IconButton
            size="sm"
            tone="neutral"
            ariaLabel={maximized ? 'Restore panel width' : 'Maximize panel'}
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
  duration: framerDuration.detailStackOverlayMount * 0.75,
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
  const overlayPresence = useMotionPresence(framerPresence.detailStackOverlay);
  const overlayTransition = useMotionTransition(framerTransition.detailStackOverlayMount);

  const renderable = top && top.node != null ? top : null;
  const isAssistantDock = renderable?.id === 'assistant';
  const isElevated = !!renderable?.elevated;
  // Modality is a per-occupant contract (`RightRailPanel.modal`, default true).
  const isModal = !isAssistantDock && renderable?.modal !== false;

  // The innermost open overlay owns Escape: while a popover / menu / cell editor
  // is up, Escape dismisses THAT, not the whole inspector underneath it.
  const overlayOpen = useAnyOverlayOpen();

  // Collapse state (localStorage) — read BEFORE the push/overlay decision, which
  // depends on it: a parked-no-strip occupant is treated as overlay so it stays
  // mounted-but-hidden (the latch below) rather than losing its slot. Band 3
  // inspector toggle / Cmd+\ write via collapse-control on the same storage key;
  // sync in-memory state on the same tab (useLocalStorage alone does not see
  // cross-component writes).
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
  const isResizable = !!renderable && !isModal && !isAssistantDock;
  // Occupants that opt out of host park (Incoming Unbox-parity) ignore
  // DETAIL_STACK_COLLAPSE / Band 3 parking — treat them as expanded even if
  // localStorage still holds a prior collapse from another rail. Hairline
  // never mounts a sash chevron; close stays header `→|`.
  const allowEdgeCollapse = renderable?.edgeCollapse !== false;
  const isCollapsed = isResizable && collapsed && allowEdgeCollapse;
  const showCollapsedStrip = renderable?.collapsedStrip !== false;

  // Whether THIS occupant pushes — the demand published to `resolveRightRailFrame`
  // (below) AND the local render decision. Computed synchronously from the
  // occupant, NOT read back from `frame.mode`.
  //
  // WHY IT IS LOCAL, NOT `frame.mode`. The demand effect publishes `wantsPush`
  // AFTER commit, so `frame.mode` lags it by one render. A push occupant therefore
  // mounted in the OVERLAY branch on its first render (`frame.mode` still
  // 'overlay') and only swapped to PUSH after the store round-trip — and
  // `AnimatePresence` keeps the losing overlay `motion.aside` alive through its
  // exit. In a throttled-rAF context that exit never completes, so the SAME
  // occupant renders TWICE (e.g. two live "Delete carton" controls on one Unbox
  // History carton). Deriving the mode from the occupant's own intent removes the
  // overlay→push handoff entirely: a push occupant only ever mounts in the push
  // branch. The frame store still owns `capPx` (the resize ceiling); only the mode
  // decision moved local.
  //
  // A chrome-owned reopen affordance (parked-no-strip) leaves no host strip, so it
  // releases push demand the same way a closed occupant does → overlay branch,
  // where it stays mounted-but-hidden (the latch).
  const wantsPush =
    inline &&
    !!renderable &&
    !isModal &&
    !isAssistantDock &&
    renderable.push !== false &&
    !(isCollapsed && !showCollapsedStrip);
  // Push mode has nothing to lock: it covers nothing.
  const isPush = wantsPush;

  useBodyScrollLock(!!renderable && isModal && !isPush);
  // Assistant keeps its own Esc. Every other occupant goes through
  // `closeRightPanel` (unmount + draft toast + occupant teardown) so wedge
  // listeners on the view die with it.
  useEscapeClose(
    isAssistantDock && !!renderable?.onClose && !overlayOpen,
    renderable?.onClose ?? (() => {}),
  );
  usePanelStoreKeyboard();

  const { width, setWidth, edgeHandleProps, isDragging } = useHorizontalEdgeResize({
    storageKey: DETAIL_STACK_RESIZE.storageKey,
    defaultWidth: DETAIL_STACK_RESIZE.defaultWidthPx,
    minWidth: DETAIL_STACK_RESIZE.minWidthPx,
    maxWidthPad: DETAIL_STACK_RESIZE.maxWidthPadPx,
    // In push mode the ceiling is derived from the frame (what the work surface
    // must keep), not from the viewport pad — the pad stays as the floor.
    maxWidth: isPush ? frame.capPx : undefined,
    enabled: isResizable,
    label: 'Resize details panel',
    testId: 'detail-inspector-resize',
  });

  /**
   * Maximize — an in-flow sash widen to the frame cap, never a cover overlay
   * (the Unbox Displays rule: the work surface keeps its floor). Transient by
   * design: closing and reopening the panel restores the persisted width.
   */
  const [maximized, setMaximized] = useState(false);
  const preMaxWidthRef = useRef<number | null>(null);
  const maximizeCapPx = isPush && isResizable ? frame.capPx : null;

  // A live sash drag abandons the latch — the operator owns the width.
  useEffect(() => {
    if (!isDragging || !maximized) return;
    setMaximized(false);
    preMaxWidthRef.current = null;
  }, [isDragging, maximized]);

  // Losing the cap (overlay mode, non-resizable occupant) must not strand the
  // panel at a width the operator can no longer undo.
  useEffect(() => {
    if (maximizeCapPx != null || !maximized) return;
    setMaximized(false);
    preMaxWidthRef.current = null;
  }, [maximizeCapPx, maximized]);

  const toggleMaximize = useCallback(() => {
    if (maximizeCapPx == null) return;
    if (maximized) {
      const restoreTo = preMaxWidthRef.current;
      preMaxWidthRef.current = null;
      setMaximized(false);
      if (restoreTo != null) setWidth(restoreTo);
      return;
    }
    preMaxWidthRef.current = width;
    setMaximized(true);
    setWidth(maximizeCapPx);
  }, [maximizeCapPx, maximized, setWidth, width]);

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
    !isAssistantDock &&
    !!renderable.closeOnOutsideClick &&
    !isCollapsed &&
    !isPush;
  const showModalBackdrop = !!renderable?.onClose && isModal && !isPush;

  const body = renderable?.node != null ? <RightRailOccupantBody node={renderable.node} /> : null;

  const showPush = isPush && !!renderable;
  const showOverlay = !isPush && !!renderable;
  const showHostClose = !!renderable && !isAssistantDock && !isCollapsed;
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
        {/* Instant width snap — Unbox Displays / ContextPanelLayout twin.
            No `motionRole.push.rail` width tween, no opacity presence, no
            occupant crossfade: selecting a row must land the inspector on the
            same frame the selection commits. */}
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
                onToggleMaximize={maximizeCapPx != null ? toggleMaximize : undefined}
              />
            ) : null}
            {renderable?.node != null ? <RightRailOccupantBody node={renderable.node} /> : null}
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
            // Modal occupants keep the blocking dialog semantics. Non-modal ones
            // are a named region: the page underneath stays scrollable, clickable
            // and readable, so announcing a modal dialog would be a lie (and the
            // host installs no focus trap — deliberately).
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
            style={
              isAssistantDock
                ? assistantDockAsideStyle()
                : {
                    ...detailStackAsideStyle(isResizable ? width : undefined),
                    ...(isCollapsed
                      ? { width: 0, minWidth: 0, padding: 0, border: 'none' }
                      : null),
                  }
            }
            className={
              isAssistantDock
                ? assistantDockAsideClassName
                : cn(
                    isElevated
                      ? detailStackAsideElevatedClassName
                      : detailStackAsideClassName,
                    // Inset grip paints on the panel seam; column may keep
                    // overflow-hidden (DETAIL_STACK_ASIDE_SURFACE).
                    isCollapsed && 'pointer-events-none opacity-0',
                  )
            }
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
