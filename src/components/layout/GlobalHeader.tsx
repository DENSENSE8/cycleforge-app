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
 * Children of the element recede (slight fade · shrink · blur, no pointer)
 * while a find field is expanded over the header — on hover intent, focus or
 * an open list (`[data-find-expanded]`, set by FindField / the everywhere
 * face; no import, one DOM fact) — EXCEPT the child that is, or holds, that
 * field: the operator's search never blurs with its header. Ease-in-out,
 * 300ms in, 200ms out (owner 2026-10-04).
 */
const RECEDE_WHILE_FINDING = [
  '[:root:has([data-find-expanded])_&>*:not([data-find-expanded]):not(:has([data-find-expanded]))]:pointer-events-none',
  '[:root:has([data-find-expanded])_&>*:not([data-find-expanded]):not(:has([data-find-expanded]))]:scale-[0.985]',
  '[:root:has([data-find-expanded])_&>*:not([data-find-expanded]):not(:has([data-find-expanded]))]:opacity-60',
  '[:root:has([data-find-expanded])_&>*:not([data-find-expanded]):not(:has([data-find-expanded]))]:blur-[5px]',
  '[:root:has([data-find-expanded])_&>*:not([data-find-expanded]):not(:has([data-find-expanded]))]:duration-300',
].join(' ');

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
        // While the search field is engaged (grown over the header), every
        // header zone recedes — fades and blurs out of focus — so the only
        // sharp thing at the top of the screen is the search. With the
        // sidebar closed the search lives IN the nav zone, so the zone that
        // holds the field stays sharp and only its other children recede.
        '[&>*]:transition-[opacity,filter,transform] [&>*]:duration-200 [&>*]:ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:[&>*]:transition-none',
        RECEDE_WHILE_FINDING,
      )}
    >
      <div
        className={cn(
          HEADER_ICON_CLUSTER,
          '[&>*]:transition-[opacity,filter,transform] [&>*]:duration-200 [&>*]:ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:[&>*]:transition-none',
          RECEDE_WHILE_FINDING,
        )}
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
