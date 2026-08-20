'use client';

import type { Ref } from 'react';
import { Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

/**
 * Add-a-task composer, docked BELOW the Daily grid.
 *
 * Outside the grid on purpose: a composer is not a row. Rendering it as one
 * would put a text input inside a virtualized list whose rows recycle, and it
 * would have to answer every column the model declares — a blank Status, a
 * blank Team — which reads as a real task that nobody has done yet.
 */
export function DailyComposerRow({
  draft,
  onDraftChange,
  onSubmit,
  pending,
  inputRef,
}: {
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  pending: boolean;
  inputRef?: Ref<HTMLInputElement>;
}) {
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
            onSubmit();
          }
        }}
        placeholder="Add a task to the shift checklist…"
        aria-label="New daily task"
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
        onClick={onSubmit}
      >
        {pending ? 'Adding…' : 'Add'}
      </Button>
    </div>
  );
}
