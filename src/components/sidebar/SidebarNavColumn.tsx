'use client';

import {
  useCallback,
  useEffect,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { appCanvasClass } from '@/design-system/tokens/app-surface';
import { SIDEBAR_SPINE_RESIZE } from '@/components/sidebar/sidebar-spine';
import { HorizontalEdgeResizeHandle } from '@/design-system/components/HorizontalEdgeResizeHandle';
import {
  EDGE_RESIZE_COLLAPSE_SLACK_PX,
  useHorizontalEdgeResize,
} from '@/design-system/hooks/useHorizontalEdgeResize';
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
 * A flex sibling of the header+content column that sets its **own width** to 0
 * or the live drag width (see "Drag to resize / collapse" below). The inner
 * `<aside>` mirrors that same width and is left-anchored inside the outer
 * box, so the rows are clipped rather than reflowed — they never lay out at
 * an intermediate width.
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
 * - **Closed**: a persistent thin strip sits at the column's edge — it is
 *   `left-0` inside the outer box but the outer stays `overflow-visible` so
 *   the strip renders even while that box is `width: 0`. Click opens at the
 *   last-known width; press-and-drag opens AND resizes in the same gesture
 *   (`onPointerDown` calls `onOpenChange(true)` before handing off to the
 *   resize hook's own pointer handling, so the drag continues live from
 *   there). The GlobalHeader toggle (`SidebarCollapseControl`) is untouched
 *   and still opens/closes with a single click — the strip is a second door
 *   onto the same `onOpenChange`, not a replacement.
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
export function SidebarNavColumn({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  /**
   * Direct setter (not a toggle) — the drag-open strip and the drag-past-min
   * collapse both need to force a SPECIFIC state, not flip whatever it
   * currently is. `ResponsiveLayout` passes its `setNavOpen` here directly;
   * the GlobalHeader toggle keeps its own `toggleNav` wrapper for the click
   * case, since a toggle is the right shape for a single button.
   */
  onOpenChange: (open: boolean) => void;
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
    if (open) setEverOpened(true);
  }, [open]);
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

  // Same splitter grammar as the context rail — see "Drag to resize /
  // collapse" above. `onCollapseBeyondMin` fires `onOpenChange(false)`
  // instead of flooring the live width at `minWidthPx`, so dragging past the
  // threshold parks the column rather than squeezing it unreadably thin.
  const { width, edgeHandleProps, isDragging, collapseArmed } = useHorizontalEdgeResize({
    storageKey: SIDEBAR_SPINE_RESIZE.storageKey,
    defaultWidth: SIDEBAR_SPINE_RESIZE.defaultWidthPx,
    minWidth: SIDEBAR_SPINE_RESIZE.minWidthPx,
    maxWidth: SIDEBAR_SPINE_RESIZE.maxWidthPx,
    edge: 'trailing',
    label: 'Resize sidebar',
    testId: 'sidebar-spine-resize',
    collapseBelowPx: SIDEBAR_SPINE_RESIZE.minWidthPx - EDGE_RESIZE_COLLAPSE_SLACK_PX,
    onCollapseBeyondMin: () => onOpenChange(false),
  });

  /**
   * Grab-to-open — the closed-state strip's `onPointerDown`. Opens FIRST
   * (synchronously, before the resize hook's own handler runs), so the very
   * same pointer-down that reveals the column also starts its drag session:
   * a press-and-drag on the collapsed edge opens AND resizes in one gesture,
   * continuing live from whatever width the column last remembered. A plain
   * click (no move before pointerup) just opens at that remembered width —
   * `useHorizontalEdgeResize`'s own `stopDrag` no-ops when nothing moved.
   */
  const onOpenStripPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      onOpenChange(true);
      edgeHandleProps.onPointerDown(e);
    },
    [onOpenChange, edgeHandleProps],
  );
  const onOpenStripKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      onOpenChange(true);
    },
    [onOpenChange],
  );

  return (
    <div
      data-sidebar-nav-column
      data-open={open ? 'true' : 'false'}
      // Width snaps open ↔ closed. There is no tween (2026-08-08) and no
      // motion import left in this file — see "Mechanism" above for the full
      // history and why the resize DRAG below is not a re-litigation of it.
      //
      // `overflow-visible` (was `overflow-hidden` — 2026-08-16, with the
      // drag-open strip): the inner `<aside>` still clips its OWN content via
      // its own `overflow-hidden`, so nothing leaks when closed. What the
      // outer's `overflow-hidden` used to ALSO do was hide the open strip
      // below — which must stay visible/hittable at `left-0` even while this
      // box is `width: 0`, or there is nothing to grab to reopen by drag.
      className="relative h-full shrink-0 overflow-visible"
      style={{ width: open ? width : 0 }}
      // The spine stays mounted once opened, so a collapsed column would
      // otherwise leave every nav row in the tab order at zero width.
      inert={!open}
    >
      {everOpened && (
        <aside
          // NOT `role="dialog" aria-modal` — it installs no focus trap and
          // blocks nothing. What it is, in the only state it has, is the
          // navigator.
          role="navigation"
          aria-label="Sidebar"
          className={cn(
            // Left-anchored, `overflow-hidden` clips its own content — the
            // outer box no longer needs to (see the style comment above).
            'absolute inset-y-0 left-0 flex flex-col overflow-hidden',
            'border-r border-border-soft',
            // The spine sits ONE PLANE BELOW the work surface (2026-08-08) —
            // canvas here, card white beside it, one hairline at the seam.
            //
            // It is load-bearing, not decoration: the navigator's selected row
            // fills to `bg-surface-card`, so it reads as the row RISING to meet
            // the surface it opens. On a white spine that fill would have had
            // to press DOWN into `surface-strong`, which at 28px reads as a
            // pressed button rather than a location. Same direction Linear
            // uses — its dark sidebar selects lighter — inverted only because
            // this theme is light. Every value is a token, so dark themes flip
            // on their own.
            appCanvasClass,
          )}
          // Width lives inline now (was the static `SIDEBAR_SPINE_WIDTH`
          // class) — it has to track the same live/persisted number as the
          // outer box every drag frame, and a Tailwind class cannot be
          // interpolated per frame.
          style={{ width: open ? width : 0 }}
        >
          {children}
        </aside>
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
      ) : (
        // Grab-to-open strip — the closed twin of the resize sash above,
        // occupying the same edge. Renders even though the outer box is
        // `width: 0` (see the `overflow-visible` note above). Click opens at
        // the remembered width; press-and-drag opens and resizes live in one
        // gesture (`onOpenStripPointerDown`).
        <div
          role="button"
          tabIndex={0}
          aria-label="Show sidebar"
          data-testid="sidebar-spine-open-strip"
          className="absolute inset-y-0 left-0 z-sticky w-1.5 cursor-col-resize touch-none bg-transparent transition-colors duration-150 hover:bg-border-default"
          onPointerDown={onOpenStripPointerDown}
          onKeyDown={onOpenStripKeyDown}
        />
      )}
    </div>
  );
}
