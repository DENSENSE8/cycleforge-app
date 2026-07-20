'use client';

import type { ReactNode, Ref } from 'react';
import { MONITOR_SECTION_CARD_SCROLL_CLASS } from '@/design-system/components/monitor';
import { cn } from '@/utils/_cn';

interface QueueTableShellProps {
  toolbar?: ReactNode;
  columnHeader?: ReactNode;
  children: ReactNode;
  scrollRef?: Ref<HTMLDivElement>;
  className?: string;
  scrollClassName?: string;
  /** Skip the monitor card shell when an outer pane (e.g. `WorkbenchTablePane`) already provides it. */
  bare?: boolean;
}

/**
 * In-card workbench table shell — toolbar + column guide pinned above a
 * self-scrolling body (date bands stick at `top-0` inside the scroll port).
 */
export function QueueTableShell({
  toolbar,
  columnHeader,
  children,
  scrollRef,
  className,
  scrollClassName,
  bare = false,
}: QueueTableShellProps) {
  return (
    <div
      className={cn(
        !bare && MONITOR_SECTION_CARD_SCROLL_CLASS,
        'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
        className,
      )}
    >
      {toolbar}
      {columnHeader}
      <div
        ref={scrollRef}
        data-testid="column-table-body"
        className={cn('min-h-0 flex-1 overflow-auto', scrollClassName)}
      >
        {children}
      </div>
    </div>
  );
}
