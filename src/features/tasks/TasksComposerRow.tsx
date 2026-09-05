'use client';

import type { Ref } from 'react';

import { Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

export type TasksComposerKind = 'task' | 'project';

/**
 * Add-a-task / new-project field, docked BELOW the Tasks grid.
 *
 * Outside the grid on purpose — a composer is not a row. One commit verb: the
 * kind is chosen by the header CTA that summoned this field.
 */
export function TasksComposerRow({
  kind,
  draft,
  onDraftChange,
  onSubmit,
  pending,
  contextLabel,
  inputRef,
}: {
  kind: TasksComposerKind;
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  pending: boolean;
  /** Project name when adding a task; unused for a new project. */
  contextLabel: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const placeholder =
    kind === 'project' ? 'New project name…' : `Add a task to ${contextLabel}…`;
  const commitLabel = kind === 'project' ? 'Create project' : 'Add';
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
        placeholder={placeholder}
        aria-label={kind === 'project' ? 'New project' : 'New task'}
        className={cn(
          'min-w-0 flex-1 bg-transparent px-1 py-1 text-role-data text-text-default',
          'placeholder:text-text-faint',
          focusRing('field', 'accent'),
        )}
      />
      <Button
        variant="primary"
        size="sm"
        disabled={!draft.trim() || pending}
        onClick={onSubmit}
        data-testid="tasks-composer-commit"
      >
        {pending ? 'Saving…' : commitLabel}
      </Button>
    </div>
  );
}
