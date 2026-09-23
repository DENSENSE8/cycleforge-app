'use client';

import { StaffRecipientList } from '@/components/quick-access/StaffRecipientList';
import type { StaffRecipient } from '@/lib/staff/staff-recipient';
import { Button } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { RECEIVING_PHOTO_STAGES } from '@/lib/receiving/photo-intent';
import { photoStageLabel } from '@/lib/photos/stages';
import { isPhotoLibraryStage, type PhotoLibraryFilterState } from '@/lib/photos/library-filter-state';
import { focusRing } from '@/design-system/tokens/focus-ring';


const fieldClass = cn(
  cn('h-10 w-full border border-border-hairline bg-surface-canvas/50 px-3 text-role-caption font-semibold text-text-default focus:bg-surface-card', focusRing('field', 'accent')),
);
const labelClass = 'mb-1.5 block text-role-caption font-semibold uppercase tracking-[0.2em] text-text-faint';

interface PhotoLibraryFilterDropdownProps {
  filters: PhotoLibraryFilterState;
  onPatch: (next: Partial<PhotoLibraryFilterState>) => void;
  onClose: () => void;
  staffOptions: ReadonlyArray<StaffRecipient>;
}

export function PhotoLibraryFilterDropdown({
  filters,
  onPatch,
  onClose,
  staffOptions,
}: PhotoLibraryFilterDropdownProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <span className={labelClass}>Staff</span>
          <span className="truncate text-role-caption font-semibold text-text-soft">
            {filters.staffId
              ? staffOptions.find((opt) => String(opt.id) === filters.staffId)?.name ??
                `Staff #${filters.staffId}`
              : 'Any staff'}
          </span>
        </div>
        <div
          className={cn(
            'border border-border-hairline bg-surface-canvas/50 p-2',
            cornerClass('flush'),
          )}
        >
          <StaffRecipientList
            staff={staffOptions}
            onPick={(staff) => onPatch({ staffId: String(staff.id) })}
            currentStaffId={filters.staffId ? Number(filters.staffId) : null}
            emptyLabel="No staff available."
            title="Select staff"
            className="max-h-[220px]"
          />
          {filters.staffId ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onPatch({ staffId: undefined })}
              className={cn(
                'mt-2 h-auto w-full border border-dashed border-border-soft px-3 py-2 text-role-caption font-semibold uppercase tracking-wider text-text-soft hover:bg-surface-card hover:text-text-default',
                cornerClass('flush'),
              )}
            >
              Clear staff
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={labelClass}>Damage</span>
          <select
            className={fieldClass}
            value={filters.damageDetected ?? ''}
            onChange={(e) => onPatch({ damageDetected: e.target.value || undefined })}
          >
            <option value="">Any</option>
            <option value="true">Damage detected</option>
            <option value="false">No damage flagged</option>
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>Analysis</span>
          <select
            className={fieldClass}
            value={filters.hasAnalysis ?? ''}
            onChange={(e) => onPatch({ hasAnalysis: e.target.value || undefined })}
          >
            <option value="">Any</option>
            <option value="true">Analyzed</option>
            <option value="false">Not analyzed</option>
          </select>
        </label>
      </div>

      {/*
        Evidence stage is an Unboxing-only sub-filter: `buildPhotoLibraryParams`
        drops `?stage=` under any other scope, so offering it there would render
        a control whose value can never survive a URL round-trip. Labels resolve
        through `photoStageLabel` — never a second stage→label map.
      */}
      {filters.sourceScope === 'unboxing' ? (
        <label className="block">
          <span className={labelClass}>Evidence stage</span>
          <select
            className={fieldClass}
            data-testid="photo-library-stage-filter"
            value={filters.stage ?? ''}
            onChange={(e) =>
              onPatch({ stage: isPhotoLibraryStage(e.target.value) ? e.target.value : undefined })
            }
          >
            <option value="">Any stage</option>
            {RECEIVING_PHOTO_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {photoStageLabel(stage)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <Button
        type="button"
        variant="brand"
        onClick={onClose}
        className={cn(
          'h-auto w-full py-3.5 text-sm font-semibold uppercase tracking-widest',
          cornerClass('flush'),
        )}
      >
        Done
      </Button>
    </div>
  );
}
