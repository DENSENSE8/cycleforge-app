'use client';

import { usePathname } from 'next/navigation';
import { useAuth, isClientPublicPath } from '@/contexts/AuthContext';
import { GlobalHeaderSearch } from './GlobalHeaderSearch';
import { SidebarCollapseControl } from './SidebarCollapseControl';
import { ActivityInboxButton } from '@/components/quick-access/ActivityInboxButton';
import { GlobalHeaderAdd } from './GlobalHeaderAdd';
import { GlobalHeaderSync } from './GlobalHeaderSync';
import { HeaderNextAction, PrintJobOverlay } from './HeaderWork';
import { StaffAccountMenu } from '@/components/identity/StaffAccountMenu';
import { HeaderCenter } from './HeaderCenter';
import {
  HEADER_ICON_CLUSTER,
  HEADER_INSET_X,
  TOP_CHROME_BAND_CLASS,
  TOP_CHROME_ZONE_GAP,
} from './header-shell';
import { appChromeMutedClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';

/**
 * Global desktop header — one persistent utility bar. The left says what the
 * operator does next, the geometric center switches the current page/record
 * context, and the right reports system work plus global actions.
 */
export function GlobalHeader({
  navOpen,
  onToggleNav,
  peeking = false,
  peekTriggerProps,
}: {
  navOpen: boolean;
  onToggleNav: () => void;
  peeking?: boolean;
  peekTriggerProps?: { onMouseEnter?: () => void; onMouseLeave?: () => void };
}) {
  const { user } = useAuth();
  const pathname = usePathname();

  if (!user || isClientPublicPath(pathname)) return null;

  return (
    <header
      className={cn(
        TOP_CHROME_BAND_CLASS,
        'relative sticky top-0 z-header w-full select-none backdrop-blur-sm',
        TOP_CHROME_ZONE_GAP,
        HEADER_INSET_X,
        appChromeMutedClass,
      )}
    >
      <div
        className={HEADER_ICON_CLUSTER}
        data-header-zone="nav"
      >
        {!navOpen && (
          <>
            <SidebarCollapseControl
              navOpen={navOpen}
              onToggleNav={onToggleNav}
              peeking={peeking}
              peekTriggerProps={peekTriggerProps}
            />
            <GlobalHeaderSearch />
          </>
        )}
      </div>

      {/* Top-left: what YOU do next on this page — beside the sidebar seam, open or closed. */}
      <HeaderNextAction />

      <HeaderCenter />

      {/* Top-right: what the SYSTEM is doing — Sync spins for syncs and prints; print jobs exist only as the overlay cards. */}
      <div className={cn(HEADER_ICON_CLUSTER, 'ml-auto')} data-header-zone="actions">
        <GlobalHeaderAdd />
        <ActivityInboxButton />
        <GlobalHeaderSync />
        <StaffAccountMenu />
        <PrintJobOverlay />
      </div>
    </header>
  );
}
