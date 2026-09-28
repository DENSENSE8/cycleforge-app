'use client';

import type { ReactNode } from 'react';
import { Menu } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { sidebarHeaderBandClass } from '@/components/layout/header-shell';

interface AppTopBarProps {
  title: string;
  onOpenDrawer: () => void;
  trailing?: ReactNode;
  className?: string;
}

/** Global mobile top app bar — [☰] [title (centered)] [trailing slot]. */
function AppTopBar({ title, onOpenDrawer, trailing, className }: AppTopBarProps) {
  return (
    <header
      className={cn(
        sidebarHeaderBandClass,
        'pt-[env(safe-area-inset-top)]',
        className,
      )}
    >
      <div className="grid w-full min-h-[44px] grid-cols-[44px_minmax(0,1fr)_44px] items-stretch">
        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label="Open app navigation"
          className="flex h-full w-full items-center justify-center bg-surface-card text-text-muted transition-colors hover:bg-surface-hover active:bg-surface-sunken"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex h-full min-w-0 items-center justify-center bg-surface-card px-3">
          <span className="truncate text-role-micro text-text-muted">
            {title}
          </span>
        </div>

        <div className="flex h-full w-full items-stretch bg-surface-card">{trailing}</div>
      </div>
    </header>
  );
}
