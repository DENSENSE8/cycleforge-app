'use client';

/**
 * Remove from list — pick why, add a note, confirm. The selection verb's
 * display (RecordActionStrip `display`): Allocate and the Live feed take an
 * order off the To-ship list the same way (`src/lib/orders/list-removal.ts`).
 */

import { useState } from 'react';
import { Button } from '@/design-system/primitives/Button';
import { TextField } from '@/design-system/primitives/TextField';
import {
  LIST_REMOVAL_NOTE_MAX,
  LIST_REMOVAL_NOTE_REQUIRED,
  LIST_REMOVAL_REASONS,
  type ListRemovalReason,
} from '@/lib/orders/list-removal';
import { cn } from '@/utils/_cn';

export function ListRemovalPicker({
  count,
  busy,
  onCancel,
  onConfirm,
}: {
  count: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: ListRemovalReason, note: string | null) => void;
}) {
  const [reason, setReason] = useState<ListRemovalReason | null>(null);
  const [note, setNote] = useState('');
  const needsNote = reason != null && LIST_REMOVAL_NOTE_REQUIRED.has(reason);
  const ready = reason != null && (!needsNote || note.trim() !== '') && !busy;

  return (
    <div className="flex flex-col gap-2" data-testid="list-removal-picker">
      <p className="px-2 pt-1 text-sm font-semibold text-text-default">
        Remove {count} order{count === 1 ? '' : 's'} from the list — why?
      </p>
      <ul role="radiogroup" aria-label="Reason" className="flex max-h-72 flex-col overflow-y-auto">
        {LIST_REMOVAL_REASONS.map((entry) => {
          const on = reason === entry.id;
          return (
            <li key={entry.id}>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setReason(entry.id)}
                data-testid={`list-removal-reason-${entry.id}`}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors',
                  on ? 'bg-surface-selected' : 'hover:bg-surface-hover',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'mt-1 flex size-4 shrink-0 items-center justify-center rounded-full ring-1 ring-inset',
                    on ? 'bg-surface-inverse ring-surface-inverse' : 'ring-border-strong',
                  )}
                >
                  {on ? <span className="size-1.5 rounded-full bg-surface-card" /> : null}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium text-text-default">{entry.label}</span>
                  <span className="text-xs text-text-muted">{entry.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <TextField
        label={needsNote ? 'Note (required)' : 'Note (optional)'}
        value={note}
        onChange={(next) => setNote(next.slice(0, LIST_REMOVAL_NOTE_MAX))}
        multiline
        rows={2}
        data-testid="list-removal-note"
      />
      <div className="flex justify-end gap-2 px-1 pb-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="danger"
          size="sm"
          disabled={!ready}
          onClick={() => reason && onConfirm(reason, note.trim() || null)}
          data-testid="list-removal-confirm"
        >
          {busy ? 'Removing…' : `Remove ${count}`}
        </Button>
      </div>
    </div>
  );
}
