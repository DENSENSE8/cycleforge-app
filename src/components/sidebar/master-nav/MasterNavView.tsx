'use client';

import type { CSSProperties } from 'react';
import type { SidebarPageNav } from '@/lib/sidebar-navigation';
import { Sidebar, SidebarProvider } from '@/components/ui/sidebar';
import { cn } from '@/utils/_cn';
import { SidebarNavList } from './SidebarNavList';

/**
 * The **sidebar spine** — page map in a resident push column, painted with
 * the shadcn Sidebar. Home · Media Library stay structural at the top.
 * Pinned, Stations, Desks, and Operations Studio are standing groups.
 */
export function MasterNavView({
  activePage,
  activeChildId,
  otherPages,
  onNavigate,
  onOpenHref,
  onRowHover,
  spineOrder,
  className,
}: {
  activePage: SidebarPageNav;
  activeChildId: string | null;
  otherPages: SidebarPageNav[];
  onNavigate: (pageId: string, childId?: string) => void;
  /** Land on an exact href (a session thread) — one push, drawer closed. */
  onOpenHref: (href: string) => void;
  onRowHover?: (page: SidebarPageNav) => void;
  spineOrder: string[];
  className?: string;
}) {
  return (
    <SidebarProvider
      className={cn('isolate flex h-full min-h-0 w-full flex-col font-spine', className)}
      style={{ '--sidebar-width': '100%' } as CSSProperties}
    >
      <Sidebar collapsible="none" className="h-full w-full bg-transparent">
        <SidebarNavList
          activePage={activePage}
          activeChildId={activeChildId}
          otherPages={otherPages}
          onNavigate={onNavigate}
          onOpenHref={onOpenHref}
          onRowHover={onRowHover}
          spineOrder={spineOrder}
        />
      </Sidebar>
    </SidebarProvider>
  );
}
