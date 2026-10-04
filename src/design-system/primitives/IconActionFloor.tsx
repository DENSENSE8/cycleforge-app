'use client';

/**
 * IconActionFloor — the shared **icons-first** bottom action row renderer (SoT).
 *
 * A {@link FloatingActionFooter} `layout="spread"`: equal-width icon peers with
 * gaps between them, no ground and no rule behind them (owner 2026-10-03) —
 * air above via `ACTION_DOCK_TOP_GAP`, lift below via `ACTION_DOCK_LIFT`.
 * Each peer carries its own opaque raised face ({@link ICON_ACTION_FLOOR_CELL_CLASS}).
 */

import type { ReactNode } from 'react';
import { FloatingActionFooter } from './FloatingActionFooter';
import { FLOATING_ACTION_DISABLED_FACE } from '@/design-system/tokens/dock-clearance';
import { cornerClass } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';
import { cn } from '@/utils/_cn';

/**
 * Idle face for an icon peer — an opaque bordered, raised button (never a
 * transparent hover wash: the peer floats, so it must read as a button on its
 * own). Disabled stays opaque via `FLOATING_ACTION_DISABLED_FACE`.
 */
export const ICON_ACTION_FLOOR_CELL_CLASS = cn(
  cornerClass('control'),
  elevationClass('raised', 'soft'),
  'bg-surface-card text-text-soft ring-1 ring-border-emphasis transition-colors hover:bg-surface-hover hover:text-text-default',
  FLOATING_ACTION_DISABLED_FACE,
);

/** Selected/active peer — the ring turns solid ink (no layout shift vs idle). */
export const ICON_ACTION_FLOOR_CELL_ACTIVE_CLASS =
  'font-semibold text-text-default ring-2 ring-text-default';

export function IconActionFloor({
  children,
  className,
  'data-testid': testId = 'icon-action-floor',
}: {
  /**
   * Equal fill-width icon peers — `⋯` More · … · Delete. Every control uses
   * `IconButton size="fill"` / `FLOATING_FOOTER_SPREAD_PEER_CLASS`.
   */
  children?: ReactNode;
  className?: string;
  'data-testid'?: string;
}) {
  if (children == null) return null;

  return (
    <FloatingActionFooter layout="spread" className={className} data-testid={testId}>
      {children}
    </FloatingActionFooter>
  );
}
