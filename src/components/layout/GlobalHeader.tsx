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
        <GlobalHeaderAdd />
        <ActivityInboxButton />
      </div>
    </header>
  );
}
