'use client';

/**
 * Job rail on the Walk-In station: Sales · Local Pickup · Repair.
 * Same chrome language as other sidebar mode rails (`HorizontalButtonSlider`
 * segmented pills). Receiving L2 now lives in GlobalHeader (Unbox pilot).
 *
 * Jobs the operator can't open are dropped from the rail (Repair needs
 * `repair.view` — see `WALK_IN_JOB_PERMISSIONS`), the same way master nav
 * filters rows on `requires`. A deep link to a denied job still resolves; the
 * body renders `WalkInJobDenied` rather than a dead pill.
 */

import { useMemo } from 'react';
import { HorizontalButtonSlider } from '@/components/ui/HorizontalButtonSlider';
import { sidebarHeaderPillRowClass } from '@/components/layout/header-shell';
import { useAuth } from '@/contexts/AuthContext';
import { WALK_IN_JOB_ITEMS, WALK_IN_JOB_PERMISSIONS, type WalkInJob } from '@/lib/walk-in/jobs';

interface WalkInJobSwitcherProps {
  job: WalkInJob;
  onChange: (next: WalkInJob) => void;
}

export function WalkInJobSwitcher({ job, onChange }: WalkInJobSwitcherProps) {
  const { has, isLoaded } = useAuth();

  const items = useMemo(
    () =>
      WALK_IN_JOB_ITEMS.filter((item) => {
        const requires = WALK_IN_JOB_PERMISSIONS[item.id as WalkInJob];
        // Permissive until loaded, so pills don't pop in on first paint.
        return !requires || !isLoaded || has(requires);
      }),
    [has, isLoaded],
  );

  return (
    <div className={sidebarHeaderPillRowClass}>
      <HorizontalButtonSlider
        items={items}
        value={job}
        onChange={(next) => onChange(next as WalkInJob)}
        variant="segmented"
        className="w-full"
        aria-label="Walk-In job"
      />
    </div>
  );
}
