'use client';

import { type CSSProperties, type Ref, type RefObject } from 'react';
import { cn } from '@/utils/_cn';

export type GridStickyXScrollbarMode = 'flex' | 'sticky';

export interface GridStickyXScrollbarProps {
  gutterRef: RefObject<HTMLDivElement | null>;
  /** Content width mirrored from the real h-scroll source (`scrollWidth`). */
  spacerWidth: number;
  /**
   * `flex` — last child of a constrained `h-full` sheet (Unbox / self-scroll).
   * `sticky` — sticks to the bottom of the nearest page scrollport (split-x /
   * ancestor Y) so tall tables do not bury the bar under rows.
   */
  mode?: GridStickyXScrollbarMode;
  className?: string;
  style?: CSSProperties;
}

/**
 * Visible horizontal scrollbar gutter for Workbench spreadsheets.
 *
 * Pair with {@link useSyncedHorizontalScrollbar}: the real body keeps
 * `no-scrollbar` (Y clean + trackpad X); this strip is the always-reachable
 * triage drag affordance at the bottom of the visible table.
 */
export function GridStickyXScrollbar({
  gutterRef,
  spacerWidth,
  mode = 'flex',
  className,
  style,
}: GridStickyXScrollbarProps) {
  return (
    <div
      ref={gutterRef as Ref<HTMLDivElement>}
      data-grid-sticky-x=""
      data-testid="grid-sticky-x-scrollbar"
      aria-hidden
      className={cn(
        // h-3 hit area — system thin scrollbar paints inside; macOS overlay
        // still needs a tappable strip taller than the 4px thumb.
        'min-w-0 w-full shrink-0 overflow-x-auto overflow-y-hidden overscroll-x-none bg-surface-card',
        'h-3 [scrollbar-gutter:stable]',
        mode === 'sticky' && 'sticky bottom-0 z-sticky',
        className,
      )}
      style={style}
    >
      <div style={{ width: spacerWidth, height: 1 }} />
    </div>
  );
}
