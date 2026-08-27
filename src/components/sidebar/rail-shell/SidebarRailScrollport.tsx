'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useMoreBelow } from '@/design-system/hooks/useMoreBelow';
import { SCROLL_MORE_BELOW_CLASS } from '@/design-system/tokens/scroll-edge';
import { cn } from '@/utils/_cn';

interface SidebarRailScrollportProps {
  children: ReactNode;
  /** Extra classes on the outer flex host (e.g. `bg-surface-card`). */
  className?: string;
  /**
   * Extra classes on the scrolling child (gutter / padding). Do not pass
   * `overflow-y-auto` — this SoT owns the scrollport.
   */
  bodyClassName?: string;
  /** Test id on the scrolling element (e.g. FBA sticky CSS var host). */
  'data-testid'?: string;
  /** Inline style on the scrolling element (CSS custom properties, …). */
  scrollStyle?: CSSProperties;
}

/**
 * Recent-rail vertical scrollport — the SoT for station / sidebar recent feeds.
 *
 * Owns `overflow-y-auto` + `scrollbar-hide` + the flat bottom "more below" fade
 * ({@link SCROLL_MORE_BELOW_CLASS} + {@link useMoreBelow}). Hosts pin scan bands
 * / filters outside this port; {@link SidebarRailShell} is content-sized and
 * must never own vertical scroll.
 *
 * Fade hides when scrolled to the end (or when content fits).
 */
export function SidebarRailScrollport({
  children,
  className,
  bodyClassName,
  'data-testid': dataTestId,
  scrollStyle,
}: SidebarRailScrollportProps) {
  const { scrollRef, moreBelow } = useMoreBelow();

  return (
    <div className={cn('relative min-h-0 min-w-0 flex-1 overflow-hidden', className)}>
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 z-raised h-10 transition-opacity duration-150',
          SCROLL_MORE_BELOW_CLASS,
          moreBelow ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div
        ref={scrollRef}
        data-testid={dataTestId}
        style={scrollStyle}
        className={cn(
          'h-full min-h-0 overflow-y-auto overscroll-contain scrollbar-hide',
          bodyClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
