'use client';

import { usePathname } from 'next/navigation';
import { useHeader } from '@/contexts/HeaderContext';
import { useAuth, isClientPublicPath } from '@/contexts/AuthContext';
import { GlobalScanDock } from './GlobalScanDock';
import { GlobalHeaderSearch } from './GlobalHeaderSearch';
import { HeaderDailyTasks } from './HeaderDailyTasks';
import { HeaderPageSwitcher } from './HeaderPageSwitcher';
import { HeaderPinsSwitcher } from './HeaderPinsSwitcher';
import { SidebarCollapseControl } from './SidebarCollapseControl';
import { ActivityInboxButton } from '@/components/quick-access/ActivityInboxButton';
import { GlobalHeaderAdd } from './GlobalHeaderAdd';
import { GlobalHeaderSync } from './GlobalHeaderSync';
import { LiveSyncIndicator } from './LiveSyncIndicator';
import {
  HEADER_ICON_CLUSTER,
  HEADER_INSET_X,
  TOP_CHROME_BAND_CLASS,
  TOP_CHROME_ZONE_GAP,
} from './header-shell';
import { appChromeMutedClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';

/**
 * Global desktop header — one persistent bar mounted once in {@link ResponsiveLayout}, above the page's `<main>`.
 * (operator 2026-09-16) — and {@link HeaderPinsSwitcher}, whose Pin glyph
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
  const { panelContent } = useHeader();
  const { user } = useAuth();
  const pathname = usePathname();

  if (!user || isClientPublicPath(pathname)) return null;

  return (
    <header
      className={cn(
        TOP_CHROME_BAND_CLASS,
        'sticky top-0 z-header w-full select-none backdrop-blur-sm',
        TOP_CHROME_ZONE_GAP,
        HEADER_INSET_X,
        appChromeMutedClass,
        // While the search field is engaged (grown over the header), every
        // header zone recedes — fades and blurs out of focus — so the only
        // sharp thing at the top of the screen is the search.
        '[&>*]:transition-[opacity,filter,transform] [&>*]:duration-200 [&>*]:ease-out motion-reduce:[&>*]:transition-none',
        '[:root:has([data-find-expanded])_&>*]:pointer-events-none [:root:has([data-find-expanded])_&>*]:scale-[0.985] [:root:has([data-find-expanded])_&>*]:opacity-30 [:root:has([data-find-expanded])_&>*]:blur-[3px]',
      )}
    >
      <div className={HEADER_ICON_CLUSTER} data-header-zone="nav">
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
        <HeaderDailyTasks />
        <HeaderPinsSwitcher />
      </div>

      <GlobalScanDock />
      <HeaderPageSwitcher />
      <div className="flex min-w-0 flex-1 items-center">{panelContent}</div>
      <div className={HEADER_ICON_CLUSTER} data-header-zone="actions">
        <LiveSyncIndicator />
        <GlobalHeaderAdd />
        <ActivityInboxButton />
        <GlobalHeaderSync />
      </div>
    </header>
  );
}
