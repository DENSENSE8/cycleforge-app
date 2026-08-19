'use client';

/**
 * Station Displays chrome footer — `Filter displays…`, and nothing else.
 *
 * Index and every leaf share this band (left context rail twin). Leaf `/`
 * commands stay on {@link StationDisplaysCommandFooter}.
 *
 * **The `→|` left this footer 2026-08-18** — dismiss is the single header
 * band's far-right cell. Never remount a second hide control here: two doors
 * onto one action is the duplication the band consolidation removed.
 */

import type { CSSProperties, KeyboardEventHandler } from 'react';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { cn } from '@/utils/_cn';

export function StationDisplaysDismissFooter({
  filterQuery,
  onFilterChange,
  onFilterClear,
  onFilterKeyDown,
  className,
}: {
  filterQuery: string;
  onFilterChange: (next: string) => void;
  onFilterClear: () => void;
  onFilterKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  className?: string;
}) {
  return (
    <div
      data-testid="station-displays-dismiss-footer"
      style={{ '--cf-density': '1' } as CSSProperties}
      className={cn('shrink-0', className)}
    >
      <TechRailSearchBar
        value={filterQuery}
        onChange={onFilterChange}
        onClear={onFilterClear}
        onKeyDown={onFilterKeyDown}
        placeholder="Filter displays…"
        density="row"
        variant="rail"
      />
    </div>
  );
}
