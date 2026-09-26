'use client';

/** IconActionFloor — the shared **icons-first** Macro action floor renderer (SoT). */

import type { ReactNode } from 'react';
import { FlushTerminalFooter } from './FlushTerminalFooter';
import { cn } from '@/utils/_cn';

/** Idle face for an icon peer cell — column hover wash + a transparent 2px bottom border reserved for the selected underline (so a toggle… */
export const ICON_ACTION_FLOOR_CELL_CLASS =
  'border-b-2 border-b-transparent text-text-soft transition-colors hover:bg-surface-hover hover:text-text-default';

/** Selected/active peer — the underline turns solid (no layout shift vs idle). */
export const ICON_ACTION_FLOOR_CELL_ACTIVE_CLASS =
  'border-b-2 border-b-text-default font-semibold text-text-default';

export function IconActionFloor({
  children,
  surface = 'canvas',
  className,
  'data-testid': testId = 'icon-action-floor',
}: {
  /**
   * Equal fill-width icon peers — `⋯` More · … · Delete. Every control uses
   * `IconButton size="fill"` / {@link FLUSH_TERMINAL_SPREAD_PEER_CLASS}.
   */
  children?: ReactNode;
  /** `card` for a Station Displays column; `canvas` for a desk floor. */
  surface?: 'card' | 'canvas';
  className?: string;
  'data-testid'?: string;
}) {
  if (children == null) return null;

  return (
    <div className={cn('h-11 shrink-0', className)} data-testid={testId}>
      <FlushTerminalFooter
        layout="spread"
        className={cn('h-full w-full', surface === 'card' && 'bg-surface-card')}
        data-testid={`${testId}-bar`}
      >
        {children}
      </FlushTerminalFooter>
    </div>
  );
}
