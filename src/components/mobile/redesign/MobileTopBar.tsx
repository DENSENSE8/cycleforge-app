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
      // `role-data` (13px), not `role-title` (18px).
      className="min-w-0 truncate text-role-data font-semibold text-text-default"
    >
      {getMobileAppTitle(pathname, searchParams)}
    </h1>
  );
}

/** Shared top bar for every primary mobile page. */
export const MobileTopBar = ({
  onBack,
  onMenu,
  overlay = false,
}: {
  /** When provided, renders a back button on the far left. */
  onBack?: () => void;
  /** When provided, renders the sidebar-drawer toggle on the far left. */
  onMenu?: () => void;
  /** Float the bar OVER the page instead of stacking above it. */
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
        // Zero padding (operator 2026-09-24):
        // Zero padding (operator 2026-09-24): the menu box and the scan box are
        'top-0 z-header flex w-full shrink-0 items-stretch justify-between',
        // The blur is the whole point, so the ground has to be see-through enough for something to show through it.
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
