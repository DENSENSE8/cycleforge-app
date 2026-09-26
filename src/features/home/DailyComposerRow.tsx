'use client';

/**
 * Add-a-checklist-item composer, docked BELOW the Daily list.
 * ONE LINE (operator 2026-09-23): *"just a simple text entry and add button
 */

import type { Ref } from 'react';
import { Button } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { dailyComposerError, type DailyComposerDraft } from '@/lib/daily-checks/composer';

export function DailyComposerRow({
  draft,
  onDraftChange,
  onSubmit,
  pending,
  error,
  inputRef,
}: {
  draft: DailyComposerDraft;
  onDraftChange: (next: DailyComposerDraft) => void;
  onSubmit: () => void;
  pending: boolean;
  /** Server-side failure text (addItem.error) — painted under the field. */
  error?: string | null;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const liveError = dailyComposerError(draft);
  const canSubmit = !liveError && !pending;

  return (
    <div className="flex shrink-0 flex-col border-b border-border-hairline bg-surface-card">
      {/* The entry rides the list's own 46rem measure — a fixed-width column
          in the middle, Add hard right of it. */}
      <div className="mx-auto flex w-full max-w-[46rem] items-center gap-2 px-3 py-2">
        <input
          ref={inputRef}
          value={draft.title}
          onChange={(e) => onDraftChange({ ...draft, title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (canSubmit) onSubmit();
            }
          }}
          placeholder="Add to today's checklist…"
          aria-label="New daily checklist item"
          className={cn(
            'min-w-0 flex-1 bg-transparent px-1 py-1 text-role-data text-text-default',
            'placeholder:text-text-faint',
            focusRing('field', 'accent'),
          )}
        />
        <Button variant="secondary" size="sm" disabled={!canSubmit} onClick={onSubmit}>
          {pending ? 'Adding…' : 'Add'}
        </Button>
      </div>

      {liveError ? (
        <p role="alert" className="mx-auto w-full max-w-[46rem] px-3 pb-2 text-role-micro text-text-muted">
          {liveError}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mx-auto w-full max-w-[46rem] px-3 pb-2 text-role-micro text-text-muted">
          {error}
        </p>
      ) : null}
    </div>
  );
}
