'use client';

/**
 * The order's note trail — **the one writable home for an operator annotation
 * on an order** (`order_notes`, via `POST /api/orders/[id]/notes`).
 *
 * Until 2026-07-31 the same job had two writable homes on one panel: this
 * append-only trail and the legacy scalar `orders.notes` behind the editor
 * dock's "Notes" composer. `2026-07-28_order_notes.sql`'s SCOPE BOUNDARY says
 * two homes are only legitimate while they do genuinely different jobs, and
 * these did not — "a note about this order" is one job, and the scalar was
 * simply the worse implementation of it (the second person to touch a row
 * overwrote the first, with no record of who said either thing).
 *
 * So the scalar is now **read-only in the product**: it still renders (below),
 * carrying whatever note the SOURCE sent at ingest, is still
 * searched by the queue's ILIKE predicate, and still lights the row's corner
 * indicator — but nothing in the product writes it. Every new annotation lands
 * here, attributed and append-only.
 * → Order note grain.
 *
 * Mounted on the desk order inspector dock (`ShippedPanelEditorDock` with
 * `showNotes`) as `variant="dock"`. Morphing desktop uses `variant="strip"`
 * (one composer row in the action bar). Morphing on a `/m/` URL uses
 * `variant="compact"` inside a BottomSheet. One component so they can never
 * drift into two note UIs. Write path: `order_notes` via
 * `POST /api/orders/[id]/notes`.
 */

import { useCallback, useMemo, useState } from 'react';
import { Loader2, Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { useAppendOrderNote, useOrderNotes } from '@/hooks/useOrderNotes';
import { formatDateTimePST } from '@/utils/date';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

export function OrderNotesTrail({
  orderId,
  legacyNote,
  className,
  autoFocus = false,
  variant = 'dock',
}: {
  orderId: number;
  legacyNote?: string | null;
  className?: string;
  autoFocus?: boolean;
  /** `strip` = Morphing desktop one-row composer. `compact` = /m/ chip sheet. */
  variant?: 'dock' | 'compact' | 'strip';
}) {
  const [draft, setDraft] = useState('');

  const notesQuery = useOrderNotes(orderId);
  const addNote = useAppendOrderNote(orderId);

  const submitNote = useCallback(() => {
    const body = draft.trim();
    if (!body || addNote.isPending) return;
    addNote.mutate(body, {
      onSuccess: () => setDraft(''),
      onError: () => toast.error('Could not add the note'),
    });
  }, [addNote, draft]);

  const notes = useMemo(() => notesQuery.data ?? [], [notesQuery.data]);
  const legacy = String(legacyNote ?? '').trim();
  const fieldClass = cn(
    'w-full resize-none rounded-lg border border-border-soft bg-surface-card inset-field text-role-caption text-text-default placeholder:text-text-faint',
    focusRing('field', 'accent'),
  );

  const composer = (
    <div className="flex min-w-0 flex-nowrap items-center gap-1.5">
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submitNote();
          }
        }}
        placeholder="Add a note…"
        aria-label="Add an order note"
        autoFocus={autoFocus}
        className={cn(fieldClass, 'min-w-0 flex-1')}
      />
      <Button
        size="sm"
        radius="pill"
        onClick={submitNote}
        disabled={!draft.trim() || addNote.isPending}
        loading={addNote.isPending}
      >
        Add
      </Button>
    </div>
  );

  if (variant === 'strip') {
    return (
      <div className={cn('min-w-0 flex-1', className)} data-testid="morphing-notes-strip">
        {composer}
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className={cn('flex flex-col gap-2', className)} data-testid="morphing-notes-sheet">
        {composer}
        {notesQuery.isPending ? (
          <p className="flex items-center gap-1.5 text-role-micro text-text-soft">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading…
          </p>
        ) : notesQuery.isError ? (
          <p className="text-role-micro text-text-danger">Notes unavailable.</p>
        ) : notes.length > 0 ? (
          <ul className="max-h-28 divide-y divide-border-hairline overflow-y-auto">
            {notes.map((note) => (
              <li key={note.id} className="py-1.5">
                <p className="truncate text-role-caption text-text-default">{note.noteText}</p>
                <p className="truncate text-role-micro text-text-soft">
                  {note.authorName ?? 'Unknown staff'} · {formatDateTimePST(note.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
        {legacy ? (
          <p className="truncate text-role-micro text-text-muted">Legacy · {legacy}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn('space-y-1', className)}>
      <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
        Notes{notes.length > 0 ? ` · ${notes.length}` : ''}
      </p>
      <p className="text-role-micro normal-case tracking-normal text-text-faint">
        Append-only, stamped with who wrote it.
      </p>

      <div className="space-y-1.5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter commits, Shift+Enter breaks the line — a note is usually
            // one sentence typed between two physical tasks.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submitNote();
            }
          }}
          rows={2}
          placeholder="Add a note for this order…"
          aria-label="Add an order note"
          autoFocus={autoFocus}
          className={fieldClass}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={submitNote}
            disabled={!draft.trim() || addNote.isPending}
            loading={addNote.isPending}
          >
            <Plus className="h-3.5 w-3.5" /> Add note
          </Button>
        </div>
      </div>

      {notesQuery.isPending ? (
        <p className="flex items-center gap-2 text-role-caption text-text-soft">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
        </p>
      ) : notesQuery.isError ? (
        // A failed sub-resource degrades to its own error box; it never takes
        // down the record (`display/workbench.md` → Degrade-not-fail).
        <p className="rounded-xl border border-dashed border-rose-200 bg-rose-50 inset-empty text-center text-role-caption text-text-danger">
          Notes unavailable.
        </p>
      ) : notes.length === 0 && !legacy ? (
        <p className="rounded-xl border border-dashed border-border-soft bg-surface-canvas inset-empty text-center text-role-caption text-text-soft">
          No notes yet. The first one is how the next shift finds out.
        </p>
      ) : notes.length > 0 ? (
        // Capped so the trail cannot push the composer off a footer dock; the
        // newest entries are the ones a queue operator is reading for.
        <ul className="max-h-56 divide-y divide-border-hairline overflow-y-auto rounded-xl border border-border-soft bg-surface-card">
          {notes.map((note) => (
            <li key={note.id} className="inset-cozy">
              <p className="whitespace-pre-wrap break-words text-role-caption text-text-default">
                {note.noteText}
              </p>
              <p className="mt-0.5 truncate text-role-eyebrow uppercase tracking-widest text-text-soft">
                {/* An author the staff table no longer has is honest absence,
                    not a reason to drop a note that is still true. */}
                {note.authorName ?? 'Unknown staff'} · {formatDateTimePST(note.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {legacy ? (
        <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas inset-cozy">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
            Legacy note · read-only
          </p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-role-caption text-text-muted">
            {legacy}
          </p>
        </div>
      ) : null}
    </div>
  );
}
