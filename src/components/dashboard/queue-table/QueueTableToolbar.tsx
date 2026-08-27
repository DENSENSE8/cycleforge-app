'use client';

import type { ReactNode } from 'react';
import { Loader2 } from '@/components/Icons';
import { PaneHeader } from '@/components/ui/pane-header';
import { cn } from '@/utils/_cn';

interface QueueTableToolbarProps {
  left?: ReactNode;
  right?: ReactNode;
  isRefreshing?: boolean;
  className?: string;
}

/** 40px in-card table toolbar — scope, period, and table controls above the column guide. */
export function QueueTableToolbar({
  left,
  right,
  isRefreshing = false,
  className,
}: QueueTableToolbarProps) {
  return (
    <PaneHeader
      className={cn('shrink-0 border-b-0 bg-surface-card', className)}
      rowClassName="border-b border-border-default"
      leftSlot={left}
      rightSlot={
        right || isRefreshing ? (
          <>
            {right}
            <div className="flex min-w-[18px] items-center justify-end">
              {isRefreshing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-text-faint" aria-hidden />
              ) : null}
            </div>
          </>
        ) : undefined
      }
    />
  );
}
