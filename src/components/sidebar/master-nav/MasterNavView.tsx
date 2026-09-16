'use client';

import type { SidebarPageNav } from '@/lib/sidebar-navigation';
import { SidebarProvider } from '@/components/ui/sidebar';
import { cn } from '@/utils/_cn';
import { SidebarNavList } from './SidebarNavList';
import { SpineNavChrome } from './SpineNavChrome';

/**
 * The **sidebar spine** — page map in a resident push column.
 *
 * Daily · Media Library stay structural; the LANES (Inbound · Outbound · …)
 * and Scan Stations are `SidebarGroup`s that collapse in place; remaining L1 is
 * staff-ordered. Settings lives in the account ⋯ menu.
 *
 * `SidebarProvider` is the shell the operator asked for (2026-09-14), mounted
 * HERE rather than inside the list so one provider serves the chrome row and
 * the nav tree. It owns no geometry: the host column (`SidebarNavColumn` /
 * `SidebarShell`) owns width, drag-resize and collapse, so the provider
 * contributes state only — see the deviation notes in `@/components/ui/sidebar`.
 */
export function MasterNavView({
  activePage,
  activeChildId,
  otherPages,
  onNavigate,
  onRowHover,
  spineOrder,
  onSpineOrderChange,
  className,
}: {
  activePage: SidebarPageNav;
  activeChildId: string | null;
  otherPages: SidebarPageNav[];
  onNavigate: (pageId: string, childId?: string) => void;
  onRowHover?: (page: SidebarPageNav) => void;
  spineOrder: string[];
  onSpineOrderChange: (ids: string[]) => void;
  className?: string;
}) {
  return (
    <SidebarProvider className={cn('isolate font-spine', className)}>
      <SpineNavChrome />
      <SidebarNavList
        activePage={activePage}
        activeChildId={activeChildId}
        otherPages={otherPages}
        onNavigate={onNavigate}
        onRowHover={onRowHover}
        spineOrder={spineOrder}
        onSpineOrderChange={onSpineOrderChange}
      />
    </SidebarProvider>
  );
}
