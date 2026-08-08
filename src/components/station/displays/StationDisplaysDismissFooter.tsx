'use client';

/**
 * Station Displays leaf footer — dismiss-only band (rail twin without a
 * list-filter field).
 *
 * Root Index owns {@link TechRailSearchBar} + `→|` fused in the search trailing
 * track. Leaf triage/action stages keep the same bottom band rhythm
 * (`border-t` · card surface · age-column track) but mount only
 * {@link StationDisplaysEdgeToggle} `column-close`. Never put `Filter displays…`
 * here — that chrome is index-stage only.
 */

import type { CSSProperties } from 'react';
import { SIDEBAR_RAIL_TRAILING_TRACK_CLASS } from '@/components/layout/header-shell';
import { cn } from '@/utils/_cn';
import { StationDisplaysEdgeToggle } from './StationDisplaysEdgeToggle';

export function StationDisplaysDismissFooter({
  onClose,
  className,
}: {
  onClose: () => void;
  className?: string;
}) {
  return (
    <div
      data-testid="station-displays-dismiss-footer"
      style={{ '--cf-density': '1' } as CSSProperties}
      className={cn(
        'flex shrink-0 items-center justify-end border-t border-border-hairline bg-surface-card py-0 pl-3 pr-0',
        className,
      )}
    >
      <div className={SIDEBAR_RAIL_TRAILING_TRACK_CLASS}>
        <StationDisplaysEdgeToggle variant="column-close" onClick={onClose} />
      </div>
    </div>
  );
}
