'use client';

/**
 * Station Displays chrome footer — Filter displays… + `→|` Hide displays.
 *
 * Index and every leaf share this band (left-rail twin). Leaf `/` commands
 * stay on {@link StationDisplaysCommandFooter}. Never remount a second hide
 * control beside this trailing track.
 */

import type { CSSProperties, KeyboardEventHandler } from 'react';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { cn } from '@/utils/_cn';
import { StationDisplaysEdgeToggle } from './StationDisplaysEdgeToggle';

export function StationDisplaysDismissFooter({
  onClose,
  filterQuery,
  onFilterChange,
  onFilterClear,
  onFilterKeyDown,
  className,
}: {
  onClose: () => void;
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
        trailingAction={
          <StationDisplaysEdgeToggle variant="column-close" onClick={onClose} />
        }
      />
    </div>
  );
}
