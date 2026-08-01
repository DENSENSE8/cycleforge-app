'use client';

/**
 * Record-plane triage block for the order inspector: the row's shared **flag**
 * and its append-only **ops-note trail**.
 *
 * Both live here rather than in the grid because both are the record plane's
 * job (`display/workbench.md` → Action planes): the flag's *reason* and the
 * notes' *authors* need more room than a cell, and the grid already carries
 * their summary (the row tint, the corner indicator). The collection map shows
 * that something is true; this is where you find out what and who.
 *
 * The notes trail is the first consumer of `order_notes`, which shipped ahead
 * of its API. It is deliberately append-only and attributed: the legacy scalar
 * `orders.notes` let the second person to touch a row overwrite the first, with
 * no record of who said either thing.
 */

import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  ORDER_ROW_FLAGS,
  resolveOrderRowFlag,
  type OrderRowFlagId,
} from '@/lib/orders/order-row-flags';
import { refreshDomain } from '@/lib/refresh/bus';
import { formatDateTimePST } from '@/utils/date';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

interface OrderNoteDto {
  id: string;
  noteText: string;
  authorStaffId: number | null;
  authorName: string | null;
  createdAt: string;
}

function orderNotesQueryKey(orderId: number) {
  return ['order-notes', orderId] as const;
}

export function OrderTriageSection({
  orderId,
  flag,
  flagSetBy,
}: {
  orderId: number;
  /** Current flag id from the row projection (`row_flag.flag`). */
  flag?: string | null;
  /** Who set it — attribution for a signal the whole org reads. */
  flagSetBy?: string | null;
}) {
  const queryClient = useQueryClient();
  const current = resolveOrderRowFlag(flag);
  const [draft, setDraft] = useState('');

  const notesQuery = useQuery({
    queryKey: orderNotesQueryKey(orderId),
    queryFn: async (): Promise<OrderNoteDto[]> => {
      const res = await fetch(`/api/orders/${orderId}/notes`);
      if (!res.ok) throw new Error(`order notes ${res.status}`);
      const data = (await res.json()) as { notes?: OrderNoteDto[] };
      return data.notes ?? [];
    },
    staleTime: 30_000,
  });

  const setFlag = useMutation({
    mutationFn: async (next: OrderRowFlagId | null) => {
      const res = await fetch(`/api/orders/${orderId}/flag`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flag: next }),
      });
      if (!res.ok) throw new Error(`set flag ${res.status}`);
      return next;
    },
    onSuccess: (next) => {
      toast.success(next === null ? 'Flag cleared' : 'Row flagged');
      // The tint lives on the queue row, which is a different query — refresh
      // the domain so the map and this panel cannot disagree about the flag.
      refreshDomain('orders.outbound');
    },
    onError: () => toast.error('Could not update the flag'),
  });

  const addNote = useMutation({
    mutationFn: async (noteText: string) => {
      const res = await fetch(`/api/orders/${orderId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteText }),
      });
      if (!res.ok) throw new Error(`add note ${res.status}`);
      const data = (await res.json()) as { note: OrderNoteDto };
      return data.note;
    },
    onSuccess: (note) => {
      // Prepend rather than refetch: the list is newest-first and the server
      // already returned the resolved author, so the optimistic row matches
      // exactly what a refetch would produce.
      queryClient.setQueryData<OrderNoteDto[]>(orderNotesQueryKey(orderId), (prev) =>
        prev ? [note, ...prev] : [note],
      );
      setDraft('');
      // The row's annotation indicator reads `note_count` off the queue query.
      refreshDomain('orders.outbound');
    },
    onError: () => toast.error('Could not add the note'),
  });

  const submitNote = useCallback(() => {
    const body = draft.trim();
    if (!body || addNote.isPending) return;
    addNote.mutate(body);
  }, [addNote, draft]);

  const notes = useMemo(() => notesQuery.data ?? [], [notesQuery.data]);

  return (
    <section className="mx-8 space-y-3">
      {/* ── Flag ─────────────────────────────────────────────────────────── */}
      <div className="space-y-1">
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Flag</p>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={setFlag.isPending}
                aria-label={current ? `Flagged ${current.label} — change` : 'Set a flag'}
                className={cn(
                  'ds-raw-button inline-flex items-center gap-1.5 rounded ring-1 ring-inset inset-chip text-role-micro uppercase tracking-widest transition-colors',
                  focusRing('control', 'accent'),
                  current
                    ? current.chipClass
                    : 'bg-surface-card text-text-soft ring-border-default hover:bg-surface-hover',
                )}
              >
                <span
                  className={cn(
                    'h-2 w-2 shrink-0 rounded-full',
                    current ? current.dotClass : 'border border-border-default',
                  )}
                  aria-hidden
                />
                {current ? current.label : 'No flag'}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {ORDER_ROW_FLAGS.map((f) => (
                <DropdownMenuItem key={f.id} onSelect={() => setFlag.mutate(f.id)}>
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', f.dotClass)} aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{f.label}</span>
                    <span className="block text-role-micro normal-case tracking-normal text-text-soft">
                      {f.hint}
                    </span>
                  </span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!current} onSelect={() => setFlag.mutate(null)}>
                Clear flag
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {setFlag.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-text-soft" aria-hidden />
          ) : current && flagSetBy ? (
            <HoverTooltip label="Flags are shared — everyone in the org sees this" focusable={false}>
              <span className="truncate text-role-micro uppercase tracking-widest text-text-soft">
                Set by {flagSetBy}
              </span>
            </HoverTooltip>
          ) : null}
        </div>
      </div>

      {/* ── Ops notes ────────────────────────────────────────────────────── */}
      <div className="space-y-1">
        {/*
          "Ops notes", not "Notes": the editor dock below still writes the legacy
          scalar `orders.notes`, and two fields both labelled Notes on one panel
          is precisely the two-writable-homes confusion `2026-07-28_order_notes`
          warns about. The word marks WHICH trail this is until the legacy field
          is retired; the sub-line says what makes it different.
        */}
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
          Ops notes{notes.length > 0 ? ` · ${notes.length}` : ''}
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
        ) : notes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-soft bg-surface-canvas inset-empty text-center text-role-caption text-text-soft">
            No notes yet. The first one is how the next shift finds out.
          </p>
        ) : (
          <ul className="divide-y divide-border-hairline rounded-xl border border-border-soft bg-surface-card">
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
        )}
      </div>
    </section>
  );
}
