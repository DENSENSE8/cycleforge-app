'use client';

import type { SidebarPageNav } from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';
import { SidebarNavList } from './SidebarNavList';
import { SpineNavChrome } from './SpineNavChrome';

/**
 * The **sidebar spine** — page map in a resident push column.
 *
 * Home · Media Library stay structural; Stations and Workspaces collapse in
 * place; remaining L1 is staff-ordered. Settings lives in the account ⋯ menu.
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
    <div className={cn('isolate flex h-full min-h-0 flex-col font-spine', className)}>
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
    </div>
  );
}
