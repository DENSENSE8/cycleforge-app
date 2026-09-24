'use client';

/**
 * Add-a-checklist-item composer, docked BELOW the Daily list.
 *
 * Outside the list on purpose: a composer is not a row. Rendering it as one
 * would put a text input inside a virtualized list whose rows recycle, and it
 * would have to answer every column the model declares — a blank Status, a
 * blank Team — which reads as a real task that nobody has done yet.
 *
 * ONE LINE (operator 2026-09-23): *"just a simple text entry and add button
 * on the right side … no left-side selector, just a fixed width in the
 * middle."* The subject switch, the details disclosure, the glyph palette,
 * the cadence switch, the owner picker and the link fields are all gone from
 * this surface. A new row is a recurring, whole-shift, unlinked check — the
 * shift default — and the rare paths (a one-off for one person, a ticket
 * link) live in the item's edit sheet after it exists, not in the moment of
 * writing one sentence down. Title + validation still come from
 * `lib/daily-checks/composer`, the one vocabulary both mounts share.
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
