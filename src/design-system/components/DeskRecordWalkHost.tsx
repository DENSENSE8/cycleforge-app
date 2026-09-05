'use client';

/**
 * Record walk chrome — table XOR (rail + form).
 *
 * **Superseded 2026-09-01 by {@link DeskStageOverlay} (Center Lock Q5).** Do not
 * mount on new desk surfaces — legacy exceptions pairing walk only.
 * Labels / paperwork and Incoming add-PO use {@link DeskStageOverlay} `fill="stage"`.
 * See docs/warehouse-os/PLAN-center-lock.md.
 */

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';

export function DeskRecordWalkHost({
  railLabel,
  rail,
  children,
  testId,
  className,
}: {
  railLabel: string;
  rail: ReactNode;
  children: ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-full min-h-0 min-w-0 w-full flex-1 bg-surface-canvas',
        className,
      )}
      data-testid={testId}
    >
      <aside
        className="flex w-[22rem] shrink-0 flex-col border-r border-border-hairline bg-surface-card"
        aria-label={railLabel}
      >
        {rail}
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-card">{children}</div>
    </div>
  );
}
