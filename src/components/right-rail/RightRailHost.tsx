'use client';

/**
 * RightRailHost — THE right details-panel wrapper / ONE owner of the right-edge
 * slot. It renders exactly the top occupant of `lib/right-rail/store.ts`.
 *
 * ## Two contracts, one host
 *
 * **PUSH (desktop record inspectors).** A non-modal occupant is an **in-flow column**: a flex
 * sibling of `ContextPanelLayout`'s host inside `<main>` that tweens its own
 * width from 0, so the work surface reflows BESIDE it instead of under it. This
 * is the house ruling — "every resident edge PUSHES; nothing floats over the
 * work surface" (`source-of-truth.md` → Right-rail modality) — and it is the
 * left edge's recipe mirrored, not a new one: `ContextPanelLayout` already
 * animates its card's own width at `overflow-visible` with an inner clip shell,
 * through `framerTransition.sidebarNavColumnMount`.
 *
 * The card is the animating element ON PURPOSE. The leading resize grip is
 * `placement="inset"` — hit sash inside the panel, 1px paint on the panel's
 * own `border-l` seam (the display hairline). Nothing hangs into the work
 * surface; Unbox Displays is the golden twin. Left context rail still uses
 * `outset` (different edge).
 *
 * **OVERLAY (explicit contracts only).** Modal / intake occupants, ambient
 * assistant, station-edge opt-outs, chromeless routes, and mobile keep the
 * fixed overlay shell. Width pressure alone NEVER turns a desktop resident
 * inspector into a floating rounded card.
 *
 * ## Two AnimatePresence, and why
 *
 * The OUTER one (push mode) keys on a **constant** — it owns the column arriving
 * and leaving the flow. The INNER one keys on the **occupant id** — it owns the
 * crossfade between occupants. Keying the outer on the occupant id would collapse
 * the column to 0 and grow it again on every genuine record→record swap, which is
 * the exact "exit → empty → enter" the stable-occupant-id rule exists to prevent.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion, motionRole, useMotionRole } from '@/design-system/motion';
import { ChevronLeft } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
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
  getServerRightRailTop,
  subscribeRightRail,
} from '@/lib/right-rail/store';
import { cn } from '@/utils/_cn';

const BACKDROP_FADE = {
  duration: framerDuration.detailStackOverlayMount * 0.75,
  ease: motionBezier.easeOut,
} as const;

/** Stable key for the push column's own arrive/leave — NEVER the occupant id. */
const PUSH_COLUMN_KEY = 'right-rail-push-column';

export function RightRailHost({ inline = true }: { inline?: boolean } = {}) {
  const top = useSyncExternalStore(subscribeRightRail, getRightRailTop, getServerRightRailTop);
  const frame = useSyncExternalStore(
    subscribeRightRailFrame,
    getRightRailFrame,
    getServerRightRailFrame,
  );
  const overlayPresence = useMotionPresence(framerPresence.detailStackOverlay);
  const overlayTransition = useMotionTransition(framerTransition.detailStackOverlayMount);
  // `motionRole.push.rail` — the sanctioned push pair (opacity-only presence +
  // the layout tween the spine and the context rail also use). Taking them as
  // one role is what keeps a spring out of a width every sibling lays out
  // against (`display/motion-crossfade.md`).
  const { presence: pushPresence, transition: pushTransition } = useMotionRole(
    motionRole.push.rail,
  );

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
  useEscapeClose(!!renderable?.onClose && !overlayOpen, renderable?.onClose ?? (() => {}));

  const { width, edgeHandleProps, isDragging } = useHorizontalEdgeResize({
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

  // Width tween ONLY on open / close. Drag + double-click snap must write
  // width instantly — otherwise the hairline / panel lag the pointer
  // (`motionRole.push.rail` is for presence, not live resize).
  const pushColumnOpen = isPush && !!renderable && !isCollapsed;
  const [pushWidthSettled, setPushWidthSettled] = useState(false);
  useEffect(() => {
    if (!pushColumnOpen) setPushWidthSettled(false);
  }, [pushColumnOpen]);
  const pushWidthTransition =
    isDragging || pushWidthSettled ? { duration: 0 } : pushTransition;
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

  const body = (
    <div
      className={cn(
        'flex h-full min-h-0 flex-1 flex-col overflow-hidden',
        isResizable && 'rounded-[inherit]', // ds-allow-radius: clip shell inherits the aside card radius
      )}
    >
      {renderable?.node}
    </div>
  );

  const showPush = isPush && !!renderable;
  const showOverlay = !isPush && !!renderable;

  // BOTH layers are always mounted, and each one's CHILD is what is conditional.
  //
  // An `AnimatePresence` that mounts together with its child suppresses the
  // enter animation under `initial={false}`, and one that unmounts together with
  // its child can never play the exit at all — the two halves of the
  // "`AnimatePresence` inside the conditional" anti-pattern
  // (`display/motion-crossfade.md`). Keeping the presence resident and toggling
  // the child is what makes the width tween play in both directions.
  //
  // An empty push layer costs nothing in the flow: it renders no element.
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
        {/* Outer presence keyed on a CONSTANT — it owns the column joining and
            leaving the flow, not the occupant swap (see the docblock).
            NO `initial={false}` here: the enter tween IS the push gesture's
            feedback, and suppressing it would make the column appear at full
            width with the work surface snapping sideways beside it. */}
        <AnimatePresence>
          {showPush && !isCollapsed ? (
            <motion.aside
              key={PUSH_COLUMN_KEY}
              role="region"
              aria-label={renderable?.ariaLabel ?? 'Details'}
              data-right-rail-column
              data-right-rail-mode="push"
              className={DETAIL_STACK_PUSH_COLUMN_CLASS}
              // The header+content column is `relative` and seven workspaces
              // mount `zIndex.panel` overlays inside it, so an in-flow column
              // with `z-index: auto` would paint under them.
              style={{ zIndex: isElevated ? zIndex.detailStack : zIndex.panel }}
              initial={{ width: 0, opacity: pushPresence.initial?.opacity as number }}
              animate={{
                width,
                opacity: 1,
                transition: pushWidthTransition,
              }}
              exit={{
                width: 0,
                opacity: pushPresence.exit?.opacity as number,
                // Close must still tween even when width settled to instant.
                transition: pushTransition,
              }}
              onAnimationComplete={() => {
                if (pushColumnOpen) setPushWidthSettled(true);
              }}
              // Default transition matches the gated width rule — do not leave
              // a lingering push.rail tween that re-targets mid-drag.
              transition={pushWidthTransition}
            >
              {/* Drag ONLY — inset on the panel's own border-l seam. No
                  `onCollapse` sash chevron (twins header `→|` / Band 3). */}
              <HorizontalEdgeResizeHandle
                edgeHandleProps={edgeHandleProps}
                isDragging={isDragging}
                edge="leading"
                placement="inset"
              />
              {/* Inner presence keyed on the OCCUPANT — the record→record
                  crossfade, unchanged from the float. */}
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={renderable?.id ?? PUSH_COLUMN_KEY}
                  className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-[inherit]" // ds-allow-radius: clip shell inherits the card radius
                  initial={pushPresence.initial}
                  animate={pushPresence.animate}
                  exit={pushPresence.exit}
                  transition={pushTransition}
                >
                  {renderable?.node}
                </motion.div>
              </AnimatePresence>
            </motion.aside>
          ) : null}
        </AnimatePresence>
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
            onClick={overlayOpen ? undefined : renderable!.onClose}
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
            {body}
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </>
  );
}
