'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useRegisterOverlay } from '@/design-system/hooks';
import { useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { framerTransitionMobile } from '@/design-system/foundations/motion-framer';
import { SCAN_FOCUS_REQUESTED_EVENT } from '@/lib/scan-hotkey/store';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import { SIDEBAR_SPINE_WIDTH } from '@/components/sidebar/sidebar-spine';
import { cn } from '@/utils/_cn';

const panelVariants = {
  hidden: { x: '-100%' },
  visible: { x: 0 },
};


/**
 * The transient container for the sidebar spine — a left-edge slide-over.
 *
 * This is the **one** nav grammar. It replaced two: the portaled `AnchoredLayer`
 * flyout that `MasterNavDropdown` flew out over the work canvas on classic
 * routes, and the in-flow nav column that station routes pushed the content
 * region across for. Same spine, same rows, one way in — so "open the sidebar"
 * means the same gesture and the same surface on every route.
 *
 * Geometry + stacking:
 * - `panel` (100) with the dismiss catcher one band below at `panelBackdrop` (99),
 *   mirroring the mobile drawer. Deliberately BELOW `panelPopover` (120) so a menu opened
 *   from inside the spine — the L2 modes panel — still paints above it instead of
 *   behind the surface it was triggered from.
 * - Portals to `<body>`: the spine must not be clipped by an ancestor
 *   `overflow-hidden` (the app frame has several) and must not inherit a
 *   stacking context from one.
 * - Transform-only motion (`x`), never width — a width tween would relayout the
 *   work surface on every open (`display/motion-crossfade.md`). Under
 *   `prefers-reduced-motion` the hooks collapse it to a plain opacity crossfade.
 *
 * **It yields to the scan bench.** A station operator's hotkey focuses a scan bar
 * that this panel may be covering, so the panel closes on
 * `SCAN_FOCUS_REQUESTED_EVENT` — the same stand-down the anchored menus used,
 * and the reason a hotkey (neither mousedown nor Escape) cannot be left to the
 * ordinary dismissal paths.
 */
export function SidebarSlideOver({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // The innermost open overlay owns Escape (`lib/overlay-stack/store.ts`), and
  // ambient owners (queue keyboard, right-rail host) stand down while we are up.
  useRegisterOverlay(open);

  const panelTransition = useMotionTransition(framerTransitionMobile.sheetSlide);

  useEffect(() => {
    if (!open) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onEscape);
    window.addEventListener(SCAN_FOCUS_REQUESTED_EVENT, onClose);
    return () => {
      window.removeEventListener('keydown', onEscape);
      window.removeEventListener(SCAN_FOCUS_REQUESTED_EVENT, onClose);
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-panel" data-sidebar-slide-over>
          {/*
            A transparent light-dismiss catcher, NOT a scrim.

            It used to paint `bg-scrim/40 backdrop-blur-[2px]` and lock body
            scroll, which made opening the nav read as a modal takeover: on a
            Workbench surface the thing it dimmed was the order grid the operator
            was navigating *from*. That is the same call the right rail already
            made — modality is for surfaces that genuinely block until dismissed,
            and a nav panel never does (`source-of-truth.md` → Right-rail
            modality). The dashboard's right-edge inspector is non-modal for
            exactly this reason; a modal panel on the left of the same surface
            was the inconsistency.

            It still catches the click, so one click anywhere outside dismisses —
            light dismiss is the right contract for a panel you leave as soon as
            you have chosen. Keeping the catcher (rather than a document-level
            outside-click listener) also avoids racing the header toggle, which
            would otherwise close and immediately reopen.
          */}
          <div
            onClick={onClose}
            className="absolute inset-0 z-panelBackdrop"
            data-sidebar-dismiss
            aria-hidden
          />
          <motion.aside
            key="sidebar-spine"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={panelTransition}
            // NOT `role="dialog" aria-modal`. This installs no focus trap, and
            // it must not: the station scan hotkey force-focuses a bar behind
            // this panel (which is why it closes on SCAN_FOCUS_REQUESTED_EVENT),
            // so trapping focus here would fight the operator's primary input.
            // `aria-modal` without containment is a claim the DOM does not
            // honor — the same false-modality bug called out for the right rail
            // in `source-of-truth.md`. What this actually is, in both of its
            // states (page list, or the route's picker), is the navigator.
            role="navigation"
            aria-label="Sidebar"
            className={cn(
              // `z-panel` is load-bearing, not decoration: the dismiss catcher
              // declares `z-panelBackdrop`, and an explicit z-index beats a later
              // sibling's auto one inside the same stacking context. Without this
              // the catcher paints OVER the spine and swallows every click in it —
              // now invisibly, since it no longer tints.
              'absolute inset-y-0 left-0 z-panel flex max-w-[calc(100vw-3rem)] flex-col overflow-hidden',
              'border-r border-border-soft shadow-2xl',
              SIDEBAR_SPINE_WIDTH,
              appChromeClass,
            )}
          >
            {children}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
