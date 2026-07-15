'use client';

import { createContext, useContext, useRef, type ReactNode, type RefObject } from 'react';
import { cn } from '@/utils/_cn';

const DashboardScrollContext = createContext<RefObject<HTMLElement | null> | null>(null);

/** Primary dashboard scroll port — virtualization targets this ancestor. */
export function useDashboardScrollParent(): RefObject<HTMLElement | null> {
  const ctx = useContext(DashboardScrollContext);
  if (!ctx) {
    throw new Error('useDashboardScrollParent must be used within DashboardScrollShell');
  }
  return ctx;
}

/** Returns null outside the dashboard scroll shell (embedded / legacy callers). */
export function useDashboardScrollParentOptional(): RefObject<HTMLElement | null> | null {
  return useContext(DashboardScrollContext);
}

export interface DashboardScrollShellProps {
  children: ReactNode;
  className?: string;
}

/**
 * Workbench scroll shell for Dashboard · Outbound — one vertical scroll region
 * for KPI + tabs + tables (mirrors {@link MonitorPageShell}).
 */
export function DashboardScrollShell({ children, className }: DashboardScrollShellProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <DashboardScrollContext.Provider value={scrollRef}>
      <div
        ref={scrollRef}
        data-testid="dashboard-scroll"
        className={cn(
          'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-clip bg-surface-canvas',
          className,
        )}
      >
        {children}
      </div>
    </DashboardScrollContext.Provider>
  );
}
