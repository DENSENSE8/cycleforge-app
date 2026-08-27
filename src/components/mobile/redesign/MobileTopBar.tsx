'use client';

import type { ReactNode } from 'react';
import { ChevronLeft, Menu } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { MobileScanCta } from './mobile-scan-cta';

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
 * Deliberately title-less: mobile pages never show a page title in the top-left.
 *
 * The **SCAN CTA owns the top-right corner** ({@link MobileScanCta}), mounted
 * HERE by the host on every mobile page — starting a scan is the act a warehouse
 * phone exists for, so it gets one fixed corner instead of living three taps
 * deep in the drawer. Pages pass their own controls via `actions`; a page must
 * never mount a second scan CTA of its own.
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
  actions,
}: {
  /** When provided, renders a back button on the far left. */
  onBack?: () => void;
  /** When provided, renders the sidebar-drawer toggle on the far left. */
  onMenu?: () => void;
  /** Page-specific controls, placed left of the scan CTA. */
  actions?: ReactNode;
}) => {
  return (
    <header className="sticky top-0 z-header flex w-full shrink-0 items-center justify-between gap-2 border-b border-border-soft bg-surface-card/90 px-4 py-2.5 backdrop-blur-xl supports-[backdrop-filter]:bg-surface-card/80">
      <div className="flex min-w-0 items-center gap-2">
        {onMenu && (
          <IconButton
            onClick={onMenu}
            ariaLabel="Open menu"
            icon={<Menu className="h-5 w-5" />}
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center border border-border-soft bg-surface-card text-text-muted transition-colors hover:bg-surface-hover',
              cornerClass('flush'),
            )}
          />
        )}
        {onBack && (
          <IconButton
            onClick={onBack}
            ariaLabel="Back"
            icon={<ChevronLeft className="h-5 w-5" />}
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center border border-border-soft bg-surface-card text-text-muted transition-colors hover:bg-surface-hover',
              cornerClass('flush'),
            )}
          />
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {actions}
        <MobileScanCta />
      </div>
    </header>
  );
};
