'use client';

/**
 * Job rail inside Receiving Walk-In: Sales · Local Pickup · Repair.
 * Same chrome language as ReceivingModeSwitcher.
 */

import { HorizontalButtonSlider } from '@/components/ui/HorizontalButtonSlider';
import { sidebarHeaderPillRowClass } from '@/components/layout/header-shell';
import { WALK_IN_JOB_ITEMS, type WalkInJob } from '@/lib/walk-in/jobs';

interface WalkInJobSwitcherProps {
  job: WalkInJob;
  onChange: (next: WalkInJob) => void;
}

export function WalkInJobSwitcher({ job, onChange }: WalkInJobSwitcherProps) {
  return (
    <div className={sidebarHeaderPillRowClass}>
      <HorizontalButtonSlider
        items={WALK_IN_JOB_ITEMS}
        value={job}
        onChange={(next) => onChange(next as WalkInJob)}
        variant="segmented"
        className="w-full"
        aria-label="Walk-In job"
      />
    </div>
  );
}
