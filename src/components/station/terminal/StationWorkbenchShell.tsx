'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { STATION_TERMINAL_SCROLL_CLEARANCE } from './StationTerminalDock';

/**
 * Shared Station workbench layout: toolbar → scroll body → optional dock.
 *
 * Matches the duplicated `relative flex h-full min-h-0 flex-col` recipe used by
 * LineEditPanel / TestingPanel / TriagePanel. Scroll body reserves bottom room
 * when the dock is an absolute float (`reserveScrollClearance`); docked bands
 * (unbox) use lighter padding instead.
 */
export function StationWorkbenchShell({
  toolbar,
  children,
  dock,
  reserveScrollClearance = true,
  className,
  scrollClassName,
}: {
  toolbar?: ReactNode;
  children: ReactNode;
  dock?: ReactNode;
  /** When true, scroll body gets `pb-32` so content clears an absolute FloatingButton. */
  reserveScrollClearance?: boolean;
  className?: string;
  scrollClassName?: string;
}) {
  return (
    <div className={cn('relative flex h-full min-h-0 flex-col bg-surface-canvas', className)}>
      {toolbar}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className={cn(
            'mx-auto w-full max-w-3xl space-y-4 px-4 py-5 sm:px-6',
            reserveScrollClearance ? STATION_TERMINAL_SCROLL_CLEARANCE : 'pb-6',
            scrollClassName,
          )}
        >
          {children}
        </div>
      </div>
      {dock}
    </div>
  );
}
