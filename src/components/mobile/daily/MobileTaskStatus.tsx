'use client';

/**
 * The task sheet's **Status** row (owner 2026-09-30: e-commerce ops states,
 * a combobox and a slider "for sliding it to not done or done or pending").
 * The pill opens the seven statuses as a sheet (a phone has no combobox
 * keyboard); the slider is the three-stop quick triage beside it.
 */

import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { TaskStatusPill } from '@/design-system/components/TaskStatusPill';
import { StopSlider } from '@/design-system/primitives/StopSlider';
import { MOBILE_ROW_CORNER } from '@/design-system/tokens/radius';
import {
  TASK_STATUSES,
  TASK_STATUS_FACE,
  TASK_STATUS_SLIDER_STOPS,
  taskStatusSliderIndex,
  type TaskStatus,
} from '@/design-system/tokens/task-status';
import { isTaskStatusReachable } from '@/lib/tasks/task-status';
import { cn } from '@/utils/_cn';

/** The slider's positions — indexes into `TASK_STATUS_SLIDER_STOPS`. */
const SLIDER_STOPS = TASK_STATUS_SLIDER_STOPS.map((_, index) => index);
const stopLabel = (index: number) => TASK_STATUS_SLIDER_STOPS[index]?.label ?? '';

export function MobileTaskStatus({
  status,
  pending,
  onSet,
}: {
  /** `taskStatusOf(row)`. */
  status: TaskStatus;
  /** A status write is in flight — the picker's rows wait for it. */
  pending: boolean;
  onSet: (target: TaskStatus) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const sliderIndex = taskStatusSliderIndex(status);

  return (
    <div className="flex shrink-0 items-start gap-3 border-b border-border-hairline px-1 py-1" data-testid="mobile-task-status">
      {/* ds-raw-button: the status pill IS the picker's trigger, sized to the 44px floor */}
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Status: ${TASK_STATUS_FACE[status].label}. Change status`}
        className="flex min-h-11 shrink-0 items-center gap-1 text-text-muted"
        data-testid="mobile-task-status-trigger"
      >
        <TaskStatusPill status={status} size="md" />
        <ChevronDown aria-hidden className="size-4" />
      </button>
      <StopSlider
        stops={SLIDER_STOPS}
        value={sliderIndex ?? 0}
        onChange={(index) => {
          const stop = TASK_STATUS_SLIDER_STOPS[index];
          if (stop) onSet(stop.status);
        }}
        ariaLabel="Quick status"
        formatValue={stopLabel}
        stopLabel={stopLabel}
        disabled={sliderIndex == null}
        className="min-w-0 flex-1"
        data-testid="mobile-task-status-slider"
      />

      <BottomSheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="Status" forceVariant="sheet" level={1}>
        <div role="radiogroup" aria-label="Status" className="flex flex-col gap-1.5 pb-2" data-testid="mobile-task-status-picker">
          {TASK_STATUSES.map((option) => {
            const face = TASK_STATUS_FACE[option];
            const Icon = face.icon;
            const current = option === status;
            const reachable = isTaskStatusReachable(status, option);
            return (
              // ds-raw-button: full-width radio row (glyph, label + hint, trailing check), not an action button
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={current}
                disabled={!reachable || pending || (current && option === 'CANCELED')}
                onClick={() => {
                  setPickerOpen(false);
                  onSet(option);
                }}
                className={cn(
                  'flex min-h-14 items-center gap-3 border px-3 py-2 text-left transition-colors disabled:opacity-50',
                  current ? 'border-border-soft bg-surface-selected' : 'border-border-hairline bg-surface-card active:bg-surface-sunken',
                  MOBILE_ROW_CORNER,
                )}
                data-task-status-option={option}
              >
                <Icon aria-hidden className={cn('size-5 shrink-0', face.ink)} strokeWidth={2.25} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-role-data font-semibold text-text-default">{face.label}</span>
                  <span className="text-role-caption text-text-muted">{face.hint}</span>
                </span>
                {current ? <Check aria-hidden className="size-5 shrink-0 text-text-default" /> : null}
              </button>
            );
          })}
        </div>
      </BottomSheet>
    </div>
  );
}
