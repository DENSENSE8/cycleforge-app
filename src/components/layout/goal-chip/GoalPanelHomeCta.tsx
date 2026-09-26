'use client';

/** The pace-and-next panel's foot: */

import Link from 'next/link';
import { Home, ChevronRight } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';

export function GoalPanelHomeCta({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="border-t border-border-hairline">
      <Link
        href="/"
        onClick={onNavigate}
        className={cn(
          'group flex w-full items-center gap-2 rounded-none px-3.5 py-2.5 transition-colors hover:bg-surface-hover',
          focusRing('control', 'accent'),
        )}
      >
        <Home className="h-3.5 w-3.5 shrink-0 text-text-muted" />
        <span className="min-w-0 flex-1 truncate text-role-caption font-semibold text-text-default">
          Open Home
        </span>
        <span className="shrink-0 text-role-micro uppercase tracking-widest text-text-soft">
          Daily
        </span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-faint" />
      </Link>
    </div>
  );
}
