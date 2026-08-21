'use client';

/**
 * @domain-job Station Displays top-band utility cluster — the carton Macro
 *   verbs, anchored to the column's top-right corner.
 * @hardware-target Station
 * @density floor
 * @justification Cannot reuse desk `InspectorActionFloor` (C2 — station
 *   Displays vs RightRailHost are separate hosts by ruling), and cannot reuse
 *   the retired bottom `StationDisplaysActionFloor` host: this row seats in the
 *   existing `STATION_DISPLAYS_PUSH_TOP_BAND` (`STATION_CHROME_ROW_FACE` /
 *   `h-7`, `items-stretch`), not in
 *   an in-flow `FlushTerminalFooter` sibling.
 *
 * Layout (ruled 2026-08-18 — utilities moved from the bottom floor to the
 * header):
 *
 *   [ maximize ] ……………………………… [ ring? ][ Refresh ][ Print? ][ Edit ][ ⋯ ]
 *
 * **`⋯` is always the last cell**, on the trailing edge. It is the universal
 * anchor for secondary and destructive verbs, and it never moves — so an
 * operator reaching for it lands on the same pixel on every station regardless
 * of which optional peers (Refresh, Print) that station wired.
 *
 * **Destructive verbs live inside `⋯`, never as an exposed peer.** A bench
 * operator clicks fast; putting Delete one click from the surface is how a
 * carton disappears mid-scan. The menu's extra click plus the existing
 * `CARTON_DELETE_UNDO_MS` toast are the two layers of safety.
 *
 * **There is deliberately NO progressive-collapse machinery.** The column's
 * floor is `STATION_DISPLAYS_MIN_WIDTH_PX` (280) and the band holds at most
 * maximize + ring + four 28px cells (~190px), so it cannot overflow — a
 * `ResizeObserver` here would be measurement for a case that does not arise.
 * If a station ever wires enough peers to overflow, collapse into `⋯` (which is
 * already the overflow host) rather than adding a second row.
 */

import type { ReactNode } from 'react';
import {
  STATION_DISPLAYS_PUSH_TOP_CELL,
  STATION_DISPLAYS_PUSH_TOP_CLUSTER,
} from '@/components/station/entity-context/station-identity-chrome';
import { cn } from '@/utils/_cn';

/**
 * Hit cell for one top-band verb — same square as maximize / close
 * ({@link STATION_DISPLAYS_PUSH_TOP_CELL}). Alias kept so carton Macro
 * compounds keep importing from this module.
 */
export const STATION_DISPLAYS_HEADER_ACTION_CELL = STATION_DISPLAYS_PUSH_TOP_CELL;

/** Glyph size for a top-band verb — matches the maximize control's `h-3.5`. */
export const STATION_DISPLAYS_HEADER_ACTION_GLYPH = 'h-3.5 w-3.5';

/** Idle face for a top-band verb — hover wash only, no travel. */
export const STATION_DISPLAYS_HEADER_ACTION_FACE =
  'h-full w-full rounded-none text-text-soft hover:bg-surface-hover hover:text-text-default';

/** Selected face (Edit while the editor is open) — inset underline, no fill. */
export const STATION_DISPLAYS_HEADER_ACTION_ACTIVE =
  'text-text-default shadow-[inset_0_-2px_0_0_currentColor]';

export function StationDisplaysHeaderActions({
  children,
  className,
  'data-testid': testId = 'station-displays-header-actions',
}: {
  /**
   * Verb cells in paint order, `⋯` last. Compose
   * {@link STATION_DISPLAYS_HEADER_ACTION_CELL} on each so the row keeps one
   * cell rhythm; never a floating island with its own margin.
   */
  children?: ReactNode;
  className?: string;
  'data-testid'?: string;
}) {
  if (children == null) return null;

  return (
    <div
      className={cn(
        STATION_DISPLAYS_PUSH_TOP_CLUSTER,
        className,
      )}
      data-testid={testId}
    >
      {children}
    </div>
  );
}
