'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { appCanvasClass } from '@/design-system/tokens/app-surface';
import { SIDEBAR_SPINE_WIDTH, SIDEBAR_SPINE_WIDTH_PX } from '@/components/sidebar/sidebar-spine';
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
 * or `SIDEBAR_SPINE_WIDTH_PX`. The inner column is fixed-width
 * (`SIDEBAR_SPINE_WIDTH`) and left-anchored inside an `overflow-hidden` outer,
 * so the rows are clipped rather than reflowed — they never lay out at an
 * intermediate width.
 *
 * **The width does not animate** (2026-08-08). It used to tween 240ms on
 * `motionRole.push.rail`, claiming the sanctioned deliberate-toggle exception
 * to the layout-animation ban (`display/motion-crossfade.md`). That exception
 * is real and still stands for the right-rail inspector and the photo drawer —
 * but it is permission, not obligation, and this column failed the same cost
 * test every other spine motion failed: opening the navigator is the app's
 * most-repeated interaction, the operator is reaching for a row whose position
 * they already know, and 240ms of grow is time inserted before they can hit
 * it. The spine and its host are now motion-free end to end.
 *
 * The clipping geometry was built FOR the tween and is kept anyway: with no
 * tween it gives the same no-reflow guarantee for free.
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
export function SidebarNavColumn({ open, children }: { open: boolean; children: ReactNode }) {
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

  return (
    <div
      data-sidebar-nav-column
      data-open={open ? 'true' : 'false'}
      // Width snaps. There is no tween (2026-08-08) and no motion import left
      // in this file.
      //
      // It used to spend 240ms growing 0 → 240 on `motionRole.push.rail`,
      // justified as the sanctioned deliberate-toggle exception to the
      // layout-animation ban (see "Mechanism" above). The exception is real
      // and still stands for the surfaces that use it — the right-rail
      // inspector, the photo drawer — but it is permission, not obligation,
      // and this column failed the cost test the same way every other spine
      // motion did: it is the app's most-repeated navigation, the operator
      // is reaching for a row they already know the position of, and 240ms
      // of grow is time inserted before they can hit it.
      //
      // The `overflow-hidden` + `absolute` inner column stays exactly as it
      // was. It was built so the content slid out from behind the frame edge
      // rather than reflowing mid-tween; with no tween it simply clips a
      // fixed-width panel to a width that changes in one frame, which is the
      // same guarantee for free — the rows never lay out at an intermediate
      // width.
      className="relative h-full shrink-0 overflow-hidden"
      style={{ width: open ? SIDEBAR_SPINE_WIDTH_PX : 0 }}
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
            // Left-anchored and fixed-width so the outer `overflow-hidden`
            // clips it into a clean slide-from-left instead of compressing the
            // rows while the column grows.
            'absolute inset-y-0 left-0 flex flex-col overflow-hidden',
            'border-r border-border-soft',
            SIDEBAR_SPINE_WIDTH,
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
        >
          {children}
        </aside>
      )}
    </div>
  );
}
