'use client';

import { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronLeft, Menu } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';
import { getMobileAppTitle } from '@/lib/mobile-context-navigation';
import { MOBILE_BAR_CELL_CLASS, useMobileActionSlotNode } from './MobileActionSlot';
import { MobileScanCta } from './mobile-scan-cta';

function MobilePageTitle() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (
    <h1
      data-testid="mobile-page-title"
      // `role-data` (13px), not `role-title` (18px). The page name is a WHERE-AM-I
      // label, not a headline: the operator reads it once on arrival and then
      // works below it, so 18px of always-on chrome bought nothing and set the
      // bar's height.
      className="min-w-0 truncate text-role-data font-semibold text-text-default"
    >
      {getMobileAppTitle(pathname, searchParams)}
    </h1>
  );
}

/**
 * Shared top bar for every primary mobile page.
 *
 * **Two controls, and that is the whole bar** (2026-08-21): menu on the left,
 * SCAN on the right, page controls between. Everything else was removed, in
 * two passes, for the same reason each time — a phone bar has room for the
 * thing you came to do and almost nothing else:
 *
 *  - the `GlobalHeaderActions` mobile cluster (clipboard · phone QR · inbox ·
 *    account avatar) moved to the drawer footer, which is the mobile
 *    counterpart of the desktop spine's account footer;
 *  - the **daily-goal chip** left too. Its no-goal face is a clipboard glyph
 *    for a waiting work order — a desk glanceable, and on a phone one more
 *    ambiguous icon between the menu and the scanner.
 *
 * Desktop wrote the test this follows: a control earns persistent rail pixels
 * by FREQUENCY, not existence. On a 390px bar the bar is stricter still.
 *
 * The page name sits immediately right of the hamburger so the operator can
 * see which surface they are on without opening the drawer.
 *
 * The **SCAN CTA owns the top-right corner** ({@link MobileScanCta}), mounted
 * HERE by the host on every mobile page — starting a scan is the act a warehouse
 * phone exists for, so it gets one fixed corner instead of living three taps
 * deep in the drawer. A page contributes its own single action through
 * {@link MobileActionSlotRegistrar}, which paints immediately LEFT of scan; a
 * page must never mount a second scan CTA of its own.
 *
 * That control carries a SECOND act — press-and-hold (or `Alt+Enter`) routes to
 * `/m/search`. It lives on the gesture rather than in this bar because the bar's
 * whole rule is "two controls, and that is the whole bar"; Find earns no third
 * seat here and, per the `nav-registry` ruling of 2026-09-14, no drawer row
 * either. See `mobile-scan-cta.tsx` for the ruling and the gesture's guards.
 *
 * That slot replaced an `actions` **prop** (removed 2026-09-15). The prop was
 * unreachable for its whole life: the only mount site is the host shell, which
 * renders the page as `children` and cannot know its verbs, so no caller could
 * ever pass it. See `MobileActionSlot.tsx` for why context is the honest edge.
 *
 * There is no unread dot on the menu button any more. It was added when the
 * inbox moved into the drawer, so the signal would survive the move; the inbox
 * has since left mobile entirely (it is a desk surface), and a badge pointing at
 * a destination that no longer exists is worse than no badge. A signal is
 * retired WITH the thing it signalled, never left behind.
 *
 * Full-bleed by design — render it as a direct child at the top of the page,
 * before any padded body wrapper, so it sticks to the top of the scroll
 * container.
 */
export const MobileTopBar = ({
  onBack,
  onMenu,
  overlay = false,
}: {
  /** When provided, renders a back button on the far left. */
  onBack?: () => void;
  /** When provided, renders the sidebar-drawer toggle on the far left. */
  onMenu?: () => void;
  /**
   * Float the bar OVER the page instead of stacking above it.
   *
   * Opt-in, and off by default on purpose: every `/m` page currently lays out
   * below a bar that occupies space, so flipping this globally would slide
   * twenty screens' first rows under the header at once. A page opts in when
   * its content is bottom-anchored (a station tape) and therefore has something
   * worth showing through the blur.
   */
  overlay?: boolean;
}) => {
  const pageAction = useMobileActionSlotNode();
  // The title needs its own air only when no box sits left of it. The menu box
  // is `md:hidden` (the desk spine owns navigation there), so the title pads
  // back in at `md` when menu is the only leading control.
  const titleInset = onBack ? null : onMenu ? 'md:pl-3' : 'pl-3';
  return (
    <header
      className={cn(
        // Zero padding (operator 2026-09-24): the menu box and the scan box are
        // square 44px cells flush to the bar's top, bottom and outer edges — the
        // phone twin of the desk's industrial bar. The cells SET the bar height
        // (no `h-*` here, so the in-flow bottom rule sits under them rather than
        // clipping them), and the cell is the touch floor, so paint == hit.
        'top-0 z-header flex w-full shrink-0 items-stretch justify-between',
        // The blur is the whole point, so the ground has to be see-through
        // enough for something to show through it. Where the browser cannot do
        // backdrop-filter the fallback is nearly opaque, because an unblurred
        // 55% wash over scrolling text is unreadable, not "slightly softer".
        'bg-surface-card/95 backdrop-blur-xl',
        'supports-[backdrop-filter]:bg-surface-card/55',
        overlay
          ? // Out of flow: content passes UNDER the bar and is read through it.
            // No bottom rule — the blur boundary is the edge, and a hairline on
            // top of it reads as a seam.
            'absolute inset-x-0'
          : // In flow, so the page below starts under it. Keeps the rule, which
            // is the only thing separating two opaque surfaces.
            'sticky border-b border-border-soft',
      )}
    >
      <div className={cn('flex min-w-0 items-center gap-3', titleInset)}>
        {onMenu && (
          <IconButton
            size="touch"
            onClick={onMenu}
            ariaLabel="Open menu"
            icon={<Menu className="h-5 w-5" />}
            className={cn(MOBILE_BAR_CELL_CLASS, 'border-r md:hidden')}
          />
        )}
        {onBack && (
          <IconButton
            size="touch"
            onClick={onBack}
            ariaLabel="Back"
            icon={<ChevronLeft className="h-5 w-5" />}
            className={cn(MOBILE_BAR_CELL_CLASS, 'border-r')}
          />
        )}
        <Suspense
          fallback={
            <h1 className="min-w-0 truncate text-role-data font-semibold text-text-default">&nbsp;</h1>
          }
        >
          <MobilePageTitle />
        </Suspense>
      </div>

      <div className="flex shrink-0 items-stretch">
        {pageAction}
        <MobileScanCta />
      </div>
    </header>
  );
};
