'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { motion, motionRole } from '@/design-system/motion';
import { useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { appChromeClass } from '@/design-system/tokens/app-surface';
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
 * A flex sibling of the header+content column that tweens its **own width**
 * from 0, exactly as `PhotoContextPanel` does on the right edge of the photo
 * viewer — the house's existing width-drawer idiom. The inner column is
 * fixed-width (`SIDEBAR_SPINE_WIDTH`) and left-anchored inside an
 * `overflow-hidden` outer, so the content slides out from behind the frame edge
 * instead of squashing while the column grows.
 *
 * This is a layout animation, which the motion law otherwise bans
 * (`display/motion-crossfade.md`). It is the sanctioned deliberate-toggle
 * exception, on the same footing as `height: auto` collapse and the photo
 * drawer: the operator asked for it, it fires once per request, and a push
 * *is* a reflow — there is no transform-only spelling of "make room". Under
 * `prefers-reduced-motion` the hook collapses it to `duration: 0`, so the
 * column snaps and nothing animates at all.
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
  // `motionRole.push.rail` — TRANSITION ONLY. This column animates its own
  // width keyframes inline rather than mounting a presence shape, so it takes
  // the role's physics without pretending to have the role's presence.
  const transition = useMotionTransition(motionRole.push.rail.transition);

  // Mount the spine on FIRST open and keep it mounted thereafter.
  //
  // Not "always": the spine is a lazy chunk, and mounting it eagerly would pull
  // the nav's whole graph into every desktop page load for a column that starts
  // collapsed (`build-gotchas.md` → bundle altitude).
  //
  // Not "only while open" either: unmounting on close empties the column a beat
  // before it finishes collapsing, so the close animation plays over a blank
  // panel. Latching also preserves the rows' scroll position between visits.
  const [everOpened, setEverOpened] = useState(open);
  useEffect(() => {
    if (open) setEverOpened(true);
  }, [open]);

  return (
    <motion.div
      data-sidebar-nav-column
      data-open={open ? 'true' : 'false'}
      // `initial={false}` so a page that loads with the column already open
      // paints it open rather than tweening it in over the first frames.
      initial={false}
      animate={{ width: open ? SIDEBAR_SPINE_WIDTH_PX : 0 }}
      transition={transition}
      className="relative h-full shrink-0 overflow-hidden"
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
            appChromeClass,
          )}
        >
          {children}
        </aside>
      )}
    </motion.div>
  );
}
