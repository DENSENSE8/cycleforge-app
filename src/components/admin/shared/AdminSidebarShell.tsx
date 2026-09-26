'use client';

import type { ReactNode } from 'react';
import { SidebarShell } from '@/components/layout/SidebarShell';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';

interface AdminSidebarShellProps {
  filters?: ReactNode;
  stats?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}

/** Admin sidebar layout — a thin wrapper over the house {@link SidebarShell}. */
export function AdminSidebarShell({
  filters,
  stats,
  action,
  children,
}: AdminSidebarShellProps) {
  return (
    <SidebarShell
      className="bg-surface-card"
      headerBelow={
        filters || stats || action ? (
          <>
            {filters ? (
              <div className={`flex items-center gap-1.5 border-b border-border-soft ${SIDEBAR_GUTTER} py-2`}>
                {filters}
              </div>
            ) : null}
            {stats ? (
              <div className={`flex flex-wrap items-center gap-1.5 border-b border-border-soft ${SIDEBAR_GUTTER} py-2`}>
                {stats}
              </div>
            ) : null}
            {action ? (
              <div className={`border-b border-border-soft ${SIDEBAR_GUTTER} py-2.5`}>{action}</div>
            ) : null}
          </>
        ) : null
      }
      bodyClassName="py-2"
    >
      {children}
    </SidebarShell>
  );
}
