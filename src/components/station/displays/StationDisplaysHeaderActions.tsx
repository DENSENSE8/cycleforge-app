'use client';

/** @domain-job Station Displays top-band utility cluster — the carton Macro verbs, anchored to the column's top-right corner. */

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
