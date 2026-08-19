'use client';

/**
 * IconActionFloor — the shared **icons-first** Macro action floor renderer (SoT).
 *
 * Equal fill-width icon peer columns (the hit target **is** the column) via
 * {@link FlushTerminalFooter} `layout="spread"`. Peers must use
 * `IconButton size="fill"` / {@link FLUSH_TERMINAL_SPREAD_PEER_CLASS} + a
 * far-right flush Delete — **never** a floating `w-11` island with a
 * justify-between gutter. Fixed `h-11` (Unbox dock Band 1 rung). Returns null
 * when empty — never mount an empty bar.
 *
 * `surface` picks the plane paint so one renderer serves two host shells:
 *  - `card`   → Station Displays column (matches the `→|` / Filter close chrome),
 *    and any desk rail whose body is one continuous white plane the floor must
 *    stay coplanar with (Media Library batch rail).
 *  - `canvas` → desk RightRailHost floor (the default plane).
 *
 * Composed by BOTH desk (`InspectorActionFloor`) and station
 * (`StationDisplaysHeaderActions`) — one display method, two host shells (C2).
 * Park / close chrome always sits on a SEPARATE row (top `DeskRailChromeRow`
 * on desk; Filter / `→|` band **above** this floor on station), never inside
 * this floor.
 *
 * Law: `.claude/rules/display/right-rail-inspector.md` · SoT Macro CTA.
 */

import type { ReactNode } from 'react';
import { FlushTerminalFooter } from './FlushTerminalFooter';
import { cn } from '@/utils/_cn';

/**
 * Idle face for an icon peer cell — column hover wash + a transparent 2px
 * bottom border reserved for the selected underline (so a toggle peer, e.g.
 * Edit-when-its-leaf-is-open, does not shift when it goes active). Mirrors the
 * Station Displays icon-rail face, but defined HERE (not pulled from
 * `SectionTabsSlider`) so a desk floor never drags the tab-slider module into
 * its bundle, and so a desk panel never name-references `SectionTabsSlider`.
 * Compose with `cornerClass('flush')` + {@link FLUSH_TERMINAL_SPREAD_PEER_CLASS}
 * on `IconButton size="fill"`.
 */
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
