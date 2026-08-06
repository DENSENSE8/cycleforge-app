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
 * here, attributed and append-only. See `.claude/rules/source-of-truth.md`
 * → Order note grain.
 *
 * Mounted on the desk order inspector dock (`ShippedPanelEditorDock` with
 * `showNotes`) and the support orders workspace. One component so they can
 * never drift into two note UIs. Write path: `order_notes` via
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
}: {
  orderId: number;
  /**
   * The legacy scalar `orders.notes` for this row, if it still carries one.
   * Rendered read-only: nothing in the product writes it, and its only writer
   * is order ingest stamping the note the SOURCE sent (a sheet's `Note` cell, a
   * buyer comment).
   */
  legacyNote?: string | null;
  className?: string;
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
          className={cn(
            'w-full resize-none rounded-lg border border-border-soft bg-surface-card inset-field text-role-caption text-text-default placeholder:text-text-faint',
            focusRing('field', 'accent'),
          )}
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
