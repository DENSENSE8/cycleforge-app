'use client';

import { type ReactNode } from 'react';
import { appContentShellClass } from '@/components/layout/header-shell';
import { SIDEBAR_SPINE_WIDTH_PX } from '@/components/sidebar/sidebar-spine';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DesktopShellProps {
  /** Left sidebar content (navigation, context panels). */
  sidebar?: ReactNode;
  /** Width of the sidebar. Default matches {@link SIDEBAR_SPINE_WIDTH_PX}. */
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
 *   │  (spine)  │                              │
 *   │           │  Main content (flex-1)       │
 *   │           │  square corner, no edge      │
 *   └───────────┴──────────────────────────────┘
 *
 * Mirrors {@link ResponsiveLayout}: chrome column is `bg-surface-card`; `<main>`
 * uses {@link appContentShellClass}, which is square-cornered and border-less —
 * the top bar's own hairline is the only separator.
 *
 * Sidebar collapses with a width transition (matches DashboardSidebar behavior).
 */
export function DesktopShell({
  sidebar,
  sidebarWidth = SIDEBAR_SPINE_WIDTH_PX,
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
        {/* `appContentShellClass` is already square-cornered — the old
            `rounded-tl-none` override for the no-top-bar case is dead. */}
        <main className={appContentShellClass}>{children}</main>
      </div>
    </div>
  );
}
