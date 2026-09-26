'use client';

/** Shared "Staged / Shelf / Lane" popover chip row (A3) — reused by every triage rail's `renderPopoverContext` so the three chips render… */

import { TriageStagingStatusChips } from '@/components/receiving/triage/TriageStagingStatusChips';
import type { TriageStagingContext } from './useTriageStagingMap';

export function TriageStagingChips({ ctx }: { ctx: TriageStagingContext | undefined }) {
  if (!ctx) return null;
  return (
    <div className="border-t border-border-hairline pt-2.5">
      <TriageStagingStatusChips
        complete={ctx.complete}
        locationLabel={ctx.locationLabel}
        lane={ctx.lane}
      />
    </div>
  );
}
