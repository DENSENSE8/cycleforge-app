'use client';

/** FlushTerminalFooter — Macro action floor for Displays / panel columns. */

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';

type FlushTerminalFooterLayout = 'bleed' | 'cluster' | 'spread';

const FLUSH_TERMINAL_FOOTER_CLASS =
  'shrink-0 border-t border-border-hairline bg-surface-canvas p-0';

/**
 * Equal-width Macro spread peer — the hit target **is** the column.
 * Use on every control in `FlushTerminalFooter` `layout="spread"` (and on
 * `IconButton size="fill"` / flush Delete). Never a floating `w-11` island.
 */
export const FLUSH_TERMINAL_SPREAD_PEER_CLASS =
  'flex h-full min-h-0 w-full min-w-0 flex-1 items-center justify-center self-stretch p-0';

/**
 * Glyph size paired with {@link FLUSH_TERMINAL_SPREAD_PEER_CLASS} /
 * `IconButton size="fill"` on the h-11 Macro floor (same rung as `touch`).
 * Never hand `h-4 w-4` on spread peers — that leaves dead air in the column.
 */
export const FLUSH_TERMINAL_SPREAD_GLYPH_CLASS = 'h-5 w-5';

/** Spread shell forces every direct peer + nested button to fill its column. */
const FLUSH_TERMINAL_SPREAD_LAYOUT_CLASS = cn(
  'flex w-full items-stretch gap-0 p-0',
  // Peers grow equally; keep glyphs centered (never items-stretch — that pins
  // SVGs to the top edge and clips stroke tips against the hairline).
  '[&>*]:flex [&>*]:min-w-0 [&>*]:flex-1 [&>*]:items-center [&>*]:justify-center [&>*]:self-stretch',
  '[&_button]:flex [&_button]:h-full [&_button]:min-h-0 [&_button]:w-full [&_button]:min-w-0 [&_button]:items-center [&_button]:justify-center',
  // Glyph height SoT — fill peers paint touch-rung icons, never micro h-4.
  // overflow-visible so stroke tips are not sheared at the viewBox edge.
  '[&_svg]:!h-5 [&_svg]:!w-5 [&_svg]:overflow-visible',
);

export function FlushTerminalFooter({
  children,
  leading,
  layout = 'cluster',
  className,
  'data-testid': testId = 'flush-terminal-footer',
}: {
  children: ReactNode;
  /** Left-side context (backup note, selection count). Cluster only. */
  leading?: ReactNode;
  layout?: FlushTerminalFooterLayout;
  className?: string;
  'data-testid'?: string;
}) {
  if (layout === 'bleed') {
    return (
      <div
        className={cn(
          FLUSH_TERMINAL_FOOTER_CLASS,
          'flex w-full items-stretch',
          className,
        )}
        data-testid={testId}
        data-flush-terminal-layout="bleed"
      >
        <div className="flex min-w-0 flex-1 items-stretch [&_button]:h-full [&_button]:min-h-9 [&_button]:w-full">
          {children}
        </div>
      </div>
    );
  }

  if (layout === 'spread') {
    return (
      <div
        className={cn(
          FLUSH_TERMINAL_FOOTER_CLASS,
          FLUSH_TERMINAL_SPREAD_LAYOUT_CLASS,
          className,
        )}
        data-testid={testId}
        data-flush-terminal-layout="spread"
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn(
        FLUSH_TERMINAL_FOOTER_CLASS,
        'flex items-stretch gap-0',
        leading ? 'justify-between' : 'justify-end',
        className,
      )}
      data-testid={testId}
      data-flush-terminal-layout="cluster"
    >
      {leading}
      <div className="flex shrink-0 items-stretch justify-end gap-0 [&_button]:h-full [&_button]:min-h-9">
        {children}
      </div>
    </div>
  );
}
