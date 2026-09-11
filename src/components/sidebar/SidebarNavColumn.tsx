'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import {
  SIDEBAR_SPINE_PEEK_INSET_PX,
  SIDEBAR_SPINE_RESIZE,
} from '@/components/sidebar/sidebar-spine';
import { HorizontalEdgeResizeHandle } from '@/design-system/components/HorizontalEdgeResizeHandle';
import { TOP_CHROME_ROW_PX } from '@/components/layout/header-shell';
import { cornerClass } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';
import { zIndex } from '@/design-system/tokens/z-index';
import { motion, useAnimationControls } from '@/design-system/motion';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import {
  useHorizontalEdgeResize,
} from '@/design-system/hooks/useHorizontalEdgeResize';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { cn } from '@/utils/_cn';

/**
 * The host for the sidebar spine — a **resident push column**, not a layer.
 *
 * ```
 *   closed                       open
 *   ┌───────────────────────┐    ┌───────┬───────────────┐
 *   │ header                │    │ nav   │ header        │
 *   │ [rail] [workspace]    │ →  │ spine │ [rail] [work] │
 *   └───────────────────────┘    └───────┴───────────────┘
 *              the frame moves right; nothing is covered
 * ```
 *
 * ## Why a push and not a slide-over
 *
 * This replaced a portaled `fixed inset-0` slide-over that painted over the work
 * canvas behind a transparent light-dismiss catcher. Two things were wrong with
 * that, and they are the same thing said twice:
 *
 * - **The navigator is not transient chrome.** It has no scrim, no focus trap
 *   and no modality (all correct — a nav never blocks until dismissed), which
 *   means it was a permanent-feeling surface pretending to be a layer. A layer
 *   that never dims what it covers is just an occlusion bug with good manners:
 *   on `/ops/photos` it landed straight on the photo grid, and on a bench it
 *   landed on the rail the operator was working from.
 * - **Covering costs more than reflowing here.** The frame is already
 *   `[rail card] [workspace]` on a canvas ground plane, so a left column is a
 *   shape it composes with rather than a shape it hides.
 *
 * ## Mechanism
 *
 * A flex sibling of the header+content column that sets its **own width** to
 * the rail width or the live drag width (see "Drag to resize / collapse"
 * below). The inner `<aside>` mirrors the OPEN width and drops to 0 when
 * collapsed, left-anchored inside the outer box, so the rows are clipped
 * rather than reflowed — they never lay out at an intermediate width, and the
 * collapsed rail is never painted over by them.
 *
 * **The OPEN ↔ CLOSED snap does not animate** (2026-08-08). It used to tween
 * 240ms on `motionRole.push.rail`, claiming the sanctioned deliberate-toggle
 * exception to the layout-animation ban (`display/motion-crossfade.md`). That
 * exception is real and still stands for the right-rail inspector and the
 * photo drawer — but it is permission, not obligation, and this column failed
 * the same cost test every other spine motion failed: opening the navigator
 * is the app's most-repeated interaction, the operator is reaching for a row
 * whose position they already know, and 240ms of grow is time inserted before
 * they can hit it. The spine and its host stay motion-free for that toggle.
 *
 * This does NOT extend to the resize drag below — a drag is not a tween. Its
 * width tracks the pointer 1:1, frame by frame; there is no eased duration to
 * ban, the same way `useHorizontalEdgeResize` dragging the context rail was
 * never a motion-ban question either.
 *
 * ## Drag to resize / collapse (2026-08-16)
 *
 * The spine now shares the context rail's exact splitter grammar
 * ({@link useHorizontalEdgeResize} + {@link HorizontalEdgeResizeHandle},
 * `edge: 'trailing'`, width persisted under {@link SIDEBAR_SPINE_RESIZE}'s
 * storage key) — this retires the note that used to live in
 * `ContextPanelLayout.tsx` calling the spine out as the one nav surface that
 * "stays click-only."
 *
 * - **Open**: the trailing-edge sash resizes live (`[SIDEBAR_SPINE_RESIZE.minWidthPx,
 *   maxWidthPx]`); dragging past the floor collapses the column instead of
 *   flooring at `minWidthPx` (`onCollapseBeyondMin` → `onOpenChange(false)`) —
 *   the same drag-past-min park the context rail already does.
 * - **Closed**: a persistent thin strip sits at the column's left edge
 *   (`left-0` — at `width: 0` the box's leading and trailing edges are the
 *   same line). Click opens at the last-known width; press-and-drag opens AND
 *   resizes in the same gesture (`onPointerDown` calls `onOpenChange(true)`
 *   before handing off to the resize hook's own pointer handling, so the drag
 *   continues live from there). **This strip is the only door back in
 *   (2026-09-08)**: the GlobalHeader show/hide toggle and this column's own
 *   top-band twin were both deleted — one control mounted twice, in the slot
 *   the header now gives to Search — so the strip is no longer a second door
 *   onto `onOpenChange`, it is the door. It is click/drag/Enter only and does
 *   not peek; the hover-peek that used to hang off the header toggle has no
 *   trigger left.
 *
 * **Two states: open, or gone (operator ruling 2026-09-05, final).** Closed is
 * `width: 0` — the column charges the frame nothing when the operator has put
 * it away, and there is no collapsed face.
 *
 * A 48px glyph rail was built earlier the same day and is deleted. The case
 * for it was that `/` is the assistant surface now, so the operator lives at
 * the frame's left edge and jumps between the assistant and a bench all day,
 * paying a re-open each time. What it actually cost: 48px of every page's
 * frame on every route, permanently, to paint glyph-only destinations with no
 * labels, no group headers and no drill — and it removed the state the
 * operator was asking for, because a navigator that is always on screen
 * cannot be put away. Two states, and the closed one is empty.
 *
 * The doors back both reopen at the remembered width: the edge strip below,
 * and ⌘K for anything the map would have been used to reach.
 *
 * The clipping geometry (outer box + absolute inner `<aside>`) was built FOR
 * the old tween and is kept anyway: with no tween — and now with a drag that
 * writes the SAME two widths every frame — it gives the same no-reflow
 * guarantee for free.
 *
 * ## What it deliberately does NOT do
 *
 * - **No Escape handler and no overlay registration.** Escape belongs to the
 *   innermost open overlay (`lib/overlay-stack/store.ts`); a resident column is
 *   not one, and registering would make ambient owners (the queue keyboard, the
 *   right-rail host) stand down for a panel that is not blocking them.
 * - **No dismiss catcher.** There is nothing underneath to click through.
 * - **No stand-down on scan-focus-requested.** The slide-over had to
 *   close for the scan hotkey because it was covering the bar the hotkey
 *   focuses. A push column never covers it — and auto-closing would reflow the
 *   bench at the exact instant the operator scans, which is strictly worse than
 *   the spine width it costs them.
 *
 * The mobile drawer is untouched: it keeps the real overlay contract
 * (scrim + scroll lock) it always had, in `ResponsiveLayout`.
 */
type PeekHoverHandlers = {
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
};

export function SidebarNavColumn({
  open,
  peeking = false,
  peekSurfaceProps,
  onPeekDismiss,
  children,
}: {
  open: boolean;
  /** Collapsed hover thumbnail — overlay, does not push the frame. */
  peeking?: boolean;
  peekSurfaceProps?: PeekHoverHandlers & { 'data-hover-surface'?: '' };
  onPeekDismiss?: () => void;
  children: ReactNode;
}) {
  /**
   * Mount the spine on first open — **or during the first idle window**,
   * whichever comes first.
   *
   * Not "only while open": unmounting on close empties the column and loses the
   * rows' scroll position between visits.
   *
   * The idle pre-mount is what makes the first open instant, and it was added
   * (2026-08-08) only after measuring that the obvious fix did not work.
   * Prefetching the chunk (`preload-spine.ts`) was the first attempt, on the
   * assumption the delay was the network. It is not: with the chunk verified
   * present before the click, a MutationObserver on this column recorded
   *
   * ```
   *     8ms   <aside> inserts — shell, plane, hardcoded width, EMPTY
   *   317ms   the content finally inserts
   *   (zero network requests in between)
   * ```
   *
   * — so the ~310ms is the React mount of the nav subtree, not a fetch. The
   * only way to take that off the click is to have already paid it.
   *
   * **The trade, stated plainly.** This walks back part of the bundle-altitude
   * reasoning that justified the lazy mount: the nav graph now renders on every
   * desktop page load, and the spine's own mount effects (its nav query, quick
   * access) run with it. Three things make that acceptable where an eager mount
   * at page load would not have been:
   *
   *  - it is `requestIdleCallback`-scheduled, so it cannot compete with paint,
   *    hydration or TTI — it uses time the main thread was going to idle away;
   *  - the column stays `width: 0` + `inert`, so nothing is visible, nothing is
   *    focusable, and nothing is in the tab order until the operator opens it;
   *  - the chunk is *already* being warmed on the same schedule, so the
   *    marginal cost is the render, not the download.
   *
   * If this ever needs to go back to being lazy, the honest replacement is an
   * honest skeleton at the real row geometry — not a return to painting a
   * finished, empty panel for a third of a second.
   */
  const [everOpened, setEverOpened] = useState(open);
  useEffect(() => {
    if (open || peeking) setEverOpened(true);
  }, [open, peeking]);
  useEffect(() => {
    if (everOpened) return;
    const ric = (window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    }).requestIdleCallback;
    if (ric) {
      const id = ric(() => setEverOpened(true), { timeout: 3_000 });
      return () => window.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(() => setEverOpened(true), 1_500);
    return () => window.clearTimeout(t);
  }, [everOpened]);

  // Same splitter grammar as the context rail, with ONE deliberate difference:
  // no `onCollapseBeyondMin`. Dragging the sash past the min floor used to
  // park the column; as of 2026-09-08 the header toggle is the only door, so
  // the sash resizes and nothing else. A gesture that closes a panel is not
  // discoverable, and having two ways to close it meant the operator could not
  // predict which one a given drag would do.
  const { width, edgeHandleProps, isDragging, collapseArmed } = useHorizontalEdgeResize({
    storageKey: SIDEBAR_SPINE_RESIZE.storageKey,
    defaultWidth: SIDEBAR_SPINE_RESIZE.defaultWidthPx,
    minWidth: SIDEBAR_SPINE_RESIZE.minWidthPx,
    maxWidth: SIDEBAR_SPINE_RESIZE.maxWidthPx,
    edge: 'trailing',
    label: 'Resize sidebar',
    testId: 'sidebar-spine-resize',
  });

  const peekOverlay = peeking && !open;
  const navVisible = open || peeking;

  const peekPresence = useMotionPresence(framerPresence.navPeekCorner);
  const peekTransition = useMotionTransition(framerTransition.navPeekCorner);
  const peekControls = useAnimationControls();
  const [peekFace, setPeekFace] = useState(peekOverlay);
  const peekOverlayRef = useRef(peekOverlay);
  peekOverlayRef.current = peekOverlay;
  const peekPresenceRef = useRef(peekPresence);
  peekPresenceRef.current = peekPresence;
  const peekTransitionRef = useRef(peekTransition);
  peekTransitionRef.current = peekTransition;

  useLayoutEffect(() => {
    if (peekOverlay) setPeekFace(true);
  }, [peekOverlay]);

  useLayoutEffect(() => {
    if (!peekFace) return undefined;
    const presence = peekPresenceRef.current;
    const transition = peekTransitionRef.current;
    if (open) {
      void peekControls.set({ opacity: 1, scale: 1 });
      setPeekFace(false);
      return undefined;
    }
    if (peekOverlay) {
      void peekControls.set(presence.initial);
      void peekControls.start({
        ...presence.animate,
        transition,
      });
      return undefined;
    }
    let cancelled = false;
    void peekControls
      .start({
        ...(presence.exit ?? presence.initial),
        transition,
      })
      .then(() => {
        if (!cancelled && !peekOverlayRef.current) setPeekFace(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, peekFace, peekOverlay, peekControls]);

  const peekLayout = peekFace && !open;

  useEffect(() => {
    if (!peekOverlay || !onPeekDismiss) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Anything stacked above the peek (a dialog, a route overlay) owns
      // Escape first — the peek is the bottom of the stack, not a peer.
      if (hasOpenOverlay()) return;
      onPeekDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [peekOverlay, onPeekDismiss]);

  return (
    <div
      data-sidebar-nav-column
      data-open={open ? 'true' : 'false'}
      data-peeking={peekOverlay ? 'true' : 'false'}
      // Width snaps open ↔ closed. There is no tween (2026-08-08) and the
      // only motion import in this file is the peek card's own presence — see
      // "Mechanism" above for the full history and why the resize DRAG below
      // is not a re-litigation of it.
      //
      // Closed is 0, not a rail width. The inner `<aside>` writes the same 0,
      // so the open spine's clipped rows cannot paint into a gutter that is
      // not there.
      //
      // `overflow-visible` (was `overflow-hidden` — 2026-08-16, with the
      // drag-open strip): the inner `<aside>` still clips its OWN content via
      // its own `overflow-hidden`, and at width 0 the reopen strip is the only
      // thing allowed to paint outside the box.
      className="relative h-full shrink-0 overflow-visible"
      style={{ width: open ? width : 0 }}
    >
      {everOpened && (
        <motion.aside
          // NOT `role="dialog" aria-modal` — it installs no focus trap and
          // blocks nothing. What it is, in the only state it has, is the
          // navigator.
          role="navigation"
          aria-label="Sidebar"
          data-testid={peekLayout ? 'sidebar-spine-peek' : undefined}
          data-spine-peek={peekLayout ? 'true' : undefined}
          // The spine stays mounted once opened, so a closed column would
          // otherwise leave every nav row in the tab order with nothing on
          // screen. `inert` sits HERE, on the rows — not on the host box, which
          // also contains the reopen strip. Putting it on the host once put the
          // only drag-open door inside an inert subtree and killed it (found by
          // pointer hit-test 2026-09-05).
          inert={!navVisible && !peekFace}
          initial={false}
          animate={peekControls}
          {...(peekLayout ? peekSurfaceProps : undefined)}
          className={cn(
            'flex flex-col overflow-hidden',
            peekLayout
              ? cn(
                  'h-auto origin-top-left border border-border-soft bg-surface-card',
                  cornerClass('surface'),
                  elevationClass('overlay'),
                  'shadow-elev-overlay-right',
                  // The head's toggle + Search row is CHROME, not map. While
                  // peeking, the GlobalHeader cluster is still on screen at the
                  // same corner (the spine is not open, so the header keeps it),
                  // so painting it here too put a second sidebar button and a
                  // second Search two inches from the first. The peek shows the
                  // NAVIGATOR; the doors stay in the header.
                  '[&_[data-spine-head-chrome]]:hidden',
                  '[&_[data-spine-account-footer]]:hidden',
                  '[&_[data-staff-account-footer]]:hidden',
                  '[&_[data-spine-nav]]:h-auto [&_[data-spine-nav]]:min-h-0',
                  // The card hugs short lists (`h-auto` shell) but is capped by
                  // maxHeight below — so the scrollport must be able to SHRINK,
                  // or a full destination list is clipped by the shell's
                  // `overflow-hidden` instead of scrolling.
                  '[&_[data-spine-scrollport]]:min-h-0 [&_[data-spine-scrollport]]:flex-1 [&_[data-spine-scrollport]]:overflow-y-auto [&_[data-spine-scrollport]]:overscroll-contain',
                  '[&_[data-spine-drill-pad]]:pb-0',
                )
              : cn(
                  'absolute inset-y-0 left-0',
                  // The seam belongs to an OPEN column. At `width: 0` a
                  // `border-r` is still 1px of box, which is how a "zero
                  // width" spine measured 1px wide (2026-09-05) — invisible,
                  // but a lie in the geometry and in every probe that reads
                  // it. Closed means closed.
                  open ? 'border-r border-border-soft' : null,
                  // The navigator is CHROME, not a work canvas (app-surface
                  // SoT: "Sidebar, GlobalHeader, body frame … theme
                  // background-surface"). It painted `appCanvasClass` here,
                  // which only stayed invisible on the hosts that cover the
                  // plane with a white `SidebarShell`; on the session surface
                  // MasterNavView is `bg-transparent`, so the canvas grey
                  // leaked through and the open column read as a different
                  // material from the header above it and the peek card that
                  // replaces it. One ground: white, same as `--sidebar`, which
                  // the sticky section labels already paint.
                  appChromeClass,
                ),
          )}
          style={
            peekLayout
              ? {
                  position: 'fixed',
                  top: TOP_CHROME_ROW_PX + SIDEBAR_SPINE_PEEK_INSET_PX,
                  left: SIDEBAR_SPINE_PEEK_INSET_PX,
                  width,
                  maxHeight: `calc(100dvh - ${TOP_CHROME_ROW_PX + SIDEBAR_SPINE_PEEK_INSET_PX * 2}px)`,
                  zIndex: zIndex.navPeek,
                  transformOrigin: '0 0',
                }
              : { width: open ? width : 0, transformOrigin: '0 0' }
          }
        >
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </motion.aside>
      )}
      {open ? (
        // Trailing-edge sash — identical grammar to the context rail's own
        // handle (`ContextPanelLayout`): 12px hit / 4px hover-reveal paint on
        // the seam, arms amber when a drag is one shove past the min floor
        // from collapsing this column.
        <HorizontalEdgeResizeHandle
          edgeHandleProps={edgeHandleProps}
          isDragging={isDragging}
          edge="trailing"
          placement="inset"
          armed={collapseArmed}
          tooltipLabel="Resize sidebar"
        />
      ) : null}
    </div>
  );
}
