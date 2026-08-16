'use client';

/**
 * Station Displays carton Macro floor — unified action row seated **above**
 * the column's close chrome (`→|` / Filter hairline), never below it.
 *
 * Layout (equal fill-width peer columns — hit target is the column).
 * Carton verb sets compose {@link CartonDisplaysActionFloor} on top of this
 * host — do not fork a second spread row.
 *
 * Composes `FlushTerminalFooter` `spread` (Claim shell). Fixed `h-11` to match
 * Unbox dock Band 1. Station Displays paints `bg-surface-card` so the Macro
 * row matches the Filter/`→|` close chrome (Claim File footer stays canvas).
 * Returns null when empty — never mount an empty bar.
 *
 * **Not** desk {@link InspectorActionFloor} (Workbench triage / RightRailHost).
 * Law: `.claude/rules/display/right-rail-inspector.md` · Station Action plane.
 */

import type { ReactNode } from 'react';
import { FlushTerminalFooter } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

export function StationDisplaysActionFloor({
  children,
  className,
  'data-testid': testId = 'station-displays-action-floor',
}: {
  /**
   * Equal fill-width icon peers — More · Sync · Print · Edit · Delete.
   * Peers must use `IconButton size="fill"` /
   * {@link FLUSH_TERMINAL_SPREAD_PEER_CLASS} — never floating `w-11` islands.
   */
  children?: ReactNode;
  className?: string;
  'data-testid'?: string;
}) {
  if (children == null) return null;

  return (
    <div className={cn('h-11 shrink-0', className)} data-testid={testId}>
      <FlushTerminalFooter
        layout="spread"
        className="h-full w-full bg-surface-card"
        data-testid={`${testId}-bar`}
      >
        {children}
      </FlushTerminalFooter>
    </div>
  );
}
