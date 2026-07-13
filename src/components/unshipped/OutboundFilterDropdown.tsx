'use client';

/**
 * FilterRefinementBar dropdown body for Dashboard · Outbound (Unshipped).
 * Writes the same URL params the board already honors (`ustatus`, `stage`, `staff`).
 */

import { Button } from '@/design-system/primitives';
import {
  FilterDropdownSelect,
  FILTER_DROPDOWN_LABEL_CLASS,
} from '@/design-system/components/FilterDropdownSelect';
import { FULFILLMENT_STATE_META, type FulfillmentState } from '@/lib/unshipped-state';
import { useOutboundSidebarScope } from '@/components/unshipped/useOutboundSidebarScope';
import { useStaffFilter } from '@/hooks/useStaffFilter';
import { HorizontalButtonSlider } from '@/components/ui/HorizontalButtonSlider';
import { cn } from '@/utils/_cn';

const LANE_OPTIONS: Array<{ id: FulfillmentState | 'all'; label: string }> = [
  { id: 'all', label: 'All lanes' },
  { id: 'BLOCKED', label: FULFILLMENT_STATE_META.BLOCKED.label },
  { id: 'PENDING', label: FULFILLMENT_STATE_META.PENDING.label },
  { id: 'TESTED', label: FULFILLMENT_STATE_META.TESTED.label },
];

const STAGE_ITEMS = [
  { id: 'all', label: 'All stages' },
  { id: 'pending', label: 'Pending' },
  { id: 'tested', label: 'Tested' },
];

export function OutboundFilterDropdown({ onClose }: { onClose: () => void }) {
  const { ustatus, stage, myStaffId, setStaff, setUstatus, setStage, staffId } =
    useOutboundSidebarScope();
  // Same staff list the board StaffFilterButton uses.
  const { options } = useStaffFilter();

  const laneValue = ustatus || 'all';
  const staffValue = staffId != null ? String(staffId) : '';

  const staffOptions = options.map((s) => ({
    value: s.id,
    label: myStaffId != null && s.id === myStaffId ? `${s.name} (me)` : s.name,
  }));

  return (
    <div className="space-y-4">
      <div>
        <p className={cn(FILTER_DROPDOWN_LABEL_CLASS, 'mb-1.5')}>Fulfillment lane</p>
        <div className="flex flex-wrap gap-1.5">
          {LANE_OPTIONS.map((opt) => {
            const active = laneValue === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setUstatus(opt.id === 'all' ? null : opt.id)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-role-caption font-medium ring-1 ring-inset transition',
                  active
                    ? 'bg-accent-bg text-accent-text ring-accent-bg'
                    : 'bg-surface-card text-text-muted ring-border-soft hover:bg-surface-hover',
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className={cn(FILTER_DROPDOWN_LABEL_CLASS, 'mb-1.5')}>Coarse stage</p>
        <HorizontalButtonSlider
          items={STAGE_ITEMS}
          value={stage}
          onChange={(id) => setStage(id as 'all' | 'pending' | 'tested')}
          variant="segmented"
          dense
          aria-label="Coarse fulfillment stage"
          className="w-full"
        />
        <p className="mt-1.5 text-role-micro font-medium text-text-faint">
          Stage is a server-side facet. Lane is exact PENDING / TESTED / BLOCKED.
        </p>
      </div>

      <FilterDropdownSelect
        label="Assigned staff"
        value={staffValue}
        onChange={(raw) => {
          if (!raw) setStaff(null);
          else {
            const n = Number(raw);
            setStaff(Number.isFinite(n) && n > 0 ? n : null);
          }
        }}
        emptyOption={{ value: '', label: 'All staff' }}
        options={staffOptions}
        ariaLabel="Assigned staff"
      />

      <Button variant="brand" size="lg" onClick={onClose} className="w-full">
        Done
      </Button>
    </div>
  );
}
