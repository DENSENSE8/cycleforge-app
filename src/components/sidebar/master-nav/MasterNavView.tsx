'use client';

import type { SidebarPageNav } from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';
import { SidebarNavList } from './SidebarNavList';

/**
 * The **sidebar spine** — page map in a resident push column.
 *
 * Home · Media Library stay structural at the top of every drill. Pinned is
 * a drop-in cluster. Scan Stations and Desks are parent drills; Studio · Admin
 * stay L1. Settings lives in the account ⋯ menu.
 */
export function MasterNavView({
  activePage,
  activeChildId,
  otherPages,
  onNavigate,
  onRowHover,
  drillId,
  onDrillChange,
  spineOrder,
  className,
}: {
  activePage: SidebarPageNav;
  activeChildId: string | null;
  otherPages: SidebarPageNav[];
  onNavigate: (pageId: string, childId?: string) => void;
  onRowHover?: (page: SidebarPageNav) => void;
  drillId: string | null;
  onDrillChange: (id: string | null) => void;
  spineOrder: string[];
  className?: string;
}) {
  return (
    <div className={cn('isolate flex h-full min-h-0 flex-col font-spine', className)}>
      <SidebarNavList
        activePage={activePage}
        activeChildId={activeChildId}
        otherPages={otherPages}
        onNavigate={onNavigate}
        onRowHover={onRowHover}
        drillId={drillId}
        onDrillChange={onDrillChange}
        spineOrder={spineOrder}
      />
    </div>
  );
}
