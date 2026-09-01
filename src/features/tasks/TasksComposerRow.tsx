'use client';

import type { Ref } from 'react';

import { Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { STATION_LABEL, type StationKey } from '@/components/layout/goal-chip/goal-chip-shared';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

/**
 * Add-a-task composer, docked BELOW the Tasks grid.
 *
 * Outside the grid on purpose — a composer is not a row (same reading as
 * `DailyComposerRow`): rendering it as one puts a text input inside a
 * virtualized list whose rows recycle, and it would have to answer every column
 * the model declares, which reads as a real task nobody has done yet.
 *
 * **Two commit verbs, one field.** A `staff_todos` row is either a to-do or a
 * recurring task, and that is not a property you can change afterwards — the
 * cycle columns exist for one kind and not the other. So the kind is chosen at
 * creation, by which button you press, rather than defaulted and then quietly
 * wrong on half the rows.
 */
export function TasksComposerRow({
  draft,
  onDraftChange,
  onSubmit,
  pending,
  stationLabel,
  inputRef,
}: {
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: (kind: 'general' | 'recurring') => void;
  pending: boolean;
  /** Station key the new task will land on — named, never silent. */
  stationLabel: string;
  /** Focus target for the page CTA that summons this composer. */
  inputRef?: Ref<HTMLInputElement>;
}) {
  const station = STATION_LABEL[stationLabel as StationKey] ?? stationLabel;
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-border-hairline bg-surface-card px-3 py-2">
      <Plus className="h-3.5 w-3.5 shrink-0 text-text-soft" aria-hidden />
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSubmit('general');
          }
        }}
        placeholder={`Add a task to ${station}…`}
        aria-label="New task"
        className={cn(
          'min-w-0 flex-1 bg-transparent px-1 py-1 text-role-data text-text-default',
          'placeholder:text-text-faint',
          focusRing('field', 'accent'),
        )}
      />
      <Button
        variant="secondary"
        size="sm"
        disabled={!draft.trim() || pending}
        onClick={() => onSubmit('recurring')}
      >
        Recurring
      </Button>
      <Button
        variant="primary"
        size="sm"
        disabled={!draft.trim() || pending}
        onClick={() => onSubmit('general')}
      >
        {pending ? 'Adding…' : 'Add'}
      </Button>
    </div>
  );
}
