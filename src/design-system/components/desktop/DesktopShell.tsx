'use client';

import { type ReactNode } from 'react';
import { appContentShellClass } from '@/components/layout/header-shell';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DesktopShellProps {
  /** Left sidebar content (navigation, context panels). */
  sidebar?: ReactNode;
  /** Width of the sidebar. Default 360px (matches existing DashboardSidebar). */
  sidebarWidth?: number | string;
  /** Whether the sidebar is collapsed (e.g., when viewing details). */
  sidebarCollapsed?: boolean;
  /** Main content area. */
  children: ReactNode;
  /** Optional top bar / header. */
  topBar?: ReactNode;
  className?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * DesktopShell — the root layout frame for desktop mode.
 *
 * Structure:
 *   ┌───────────┬──────────────────────────────┐
 *   │           │ Top bar (optional)            │
 *   │  Sidebar  ├──────────────────────────────┤
 *   │  (360px)  │                              │
 *   │           │  Main content (flex-1)       │
 *   │           │  soft-tl radius under header │
 *   └───────────┴──────────────────────────────┘
 *
 * Mirrors {@link ResponsiveLayout}: chrome column is `bg-surface-card`; `<main>`
 * uses {@link appContentShellClass} so the sidebar × header join is a soft
 * corner instead of a hard L of hairlines.
 *
 * Sidebar collapses with a width transition (matches DashboardSidebar behavior).
 */
export function DesktopShell({
  sidebar,
  sidebarWidth = 360,
  sidebarCollapsed = false,
  children,
  topBar,
  className = '',
}: DesktopShellProps) {
  const resolvedWidth = typeof sidebarWidth === 'number' ? `${sidebarWidth}px` : sidebarWidth;

  return (
    <div className={cn('flex h-screen overflow-hidden', appChromeClass, className)}>
      {/* ── Sidebar ── */}
      {sidebar && (
        <div
          className="h-full flex-shrink-0 overflow-hidden transition-[width] duration-300"
          style={{ width: sidebarCollapsed ? 0 : resolvedWidth }}
        >
          {sidebar}
        </div>
      )}

      {/* ── Main area ── */}
      <div className={cn('flex min-w-0 flex-1 flex-col overflow-hidden', appChromeClass)}>
        {topBar && (
          <div className="flex-shrink-0">{topBar}</div>
        )}
        <main className={cn(appContentShellClass, !topBar && 'rounded-tl-none')}>
          {children}
        </main>
      </div>
    </div>
  );
}
