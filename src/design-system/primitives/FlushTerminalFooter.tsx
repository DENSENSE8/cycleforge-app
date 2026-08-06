'use client';

/**
 * FlushTerminalFooter — Macro action floor for Displays / panel columns.
 *
 * **Lane:** panel-terminal commit or multi-select bulk (Claim File, Move photos,
 * Prebox Print, Send note). Not station `SlicedActionDock`, not soft
 * `StickyActionBar`, not mobile `ConfirmDock`.
 *
 * **Geometry:** in-flow flex sibling under a `flex-1 overflow-y-auto` body —
 * the physical floor of the column. Shell is always
 * `shrink-0 border-t border-border-hairline bg-surface-canvas p-0` (Claim
 * golden). Never CSS `sticky`/`absolute`, never outer `px`/`py` air around the
 * primary square, never soft upward shadow.
 *
 * **Layouts:**
 * - `bleed` — children fill the width (single full-bleed primary Button).
 * - `cluster` — optional `leading` + end-aligned action cluster (Claim backup
 *   + File; Prebox "N selected" + Print).
 *
 * Pair with flush-square DS `Button` (`cornerClass('flush')`). Micro (per-row)
 * actions stay on `IconButton size="md"` inside the scroll rows — never a
 * primary text Button in a repeating list row.
 */

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';

type FlushTerminalFooterLayout = 'bleed' | 'cluster';

const FLUSH_TERMINAL_FOOTER_CLASS =
  'shrink-0 border-t border-border-hairline bg-surface-canvas p-0';

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
