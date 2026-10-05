'use client';

/**
 * Comments on a package — the order's internal notes (`order_notes`, the same
 * trail Allocate's record shows), oldest first like a conversation, with the
 * composer under them. Enter posts, Shift+Enter breaks the line.
 */

import { useState, type KeyboardEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { Button } from '@/design-system/primitives/Button';
import { TextField } from '@/design-system/primitives/TextField';
import { useAppendOrderNote, useOrderNotes } from '@/hooks/useOrderNotes';
import { LIVE_FEED_QUERY_ROOT } from '@/lib/live-feed/query';
import { splitNoteMentions } from '@/lib/orders/note-mentions';
import { toast } from '@/lib/toast';
import { formatMonthDayTimePST } from '@/utils/date';

function NoteBody({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">
      {splitNoteMentions(text).map((segment, index) =>
        segment.kind === 'mention' ? (
          <span key={index} className="rounded bg-sky-50 px-1 font-medium text-sky-700">
            @{segment.name}
          </span>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </p>
  );
}

export function PackageCommentThread({ orderRowId }: { orderRowId: number }) {
  const notes = useOrderNotes(orderRowId);
  if (notes.isLoading) return <p className="text-sm text-slate-400">Loading comments…</p>;
  const list = [...(notes.data ?? [])].reverse();
  if (list.length === 0) {
    return <p className="text-sm text-slate-500">No comments yet. Say what happened — the next hand will see it here and on the card.</p>;
  }
  return (
    <ol className="flex flex-col gap-4" data-testid="live-feed-comments">
      {list.map((note) => (
        <li key={note.id} className="flex gap-2.5">
          <StaffAvatar staffId={note.authorStaffId} name={note.authorName} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline gap-2">
              <span className="text-sm font-semibold text-slate-900">{note.authorName ?? 'Staff'}</span>
              <span className="text-xs tabular-nums text-slate-400">{formatMonthDayTimePST(note.createdAt)}</span>
            </p>
            <div className="mt-1 rounded-2xl rounded-tl-md bg-slate-100 px-3 py-2">
              <NoteBody text={note.noteText} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function PackageCommentComposer({ orderRowId }: { orderRowId: number }) {
  const queryClient = useQueryClient();
  const append = useAppendOrderNote(orderRowId);
  const [draft, setDraft] = useState('');
  const send = () => {
    const text = draft.trim();
    if (!text || append.isPending) return;
    append.mutate(text, {
      onSuccess: () => {
        setDraft('');
        void queryClient.invalidateQueries({ queryKey: LIVE_FEED_QUERY_ROOT });
      },
      onError: () => toast.error("Couldn't post the comment"),
    });
  };
  return (
    <form
      className="flex items-end gap-2"
      data-testid="live-feed-composer"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <TextField
        label="Comment on this package"
        value={draft}
        onChange={setDraft}
        multiline
        rows={2}
        className="min-w-0 flex-1"
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            send();
          }
        }}
      />
      <Button type="submit" variant="primary" size="lg" radius="pill" loading={append.isPending} disabled={!draft.trim()}>
        Post
      </Button>
    </form>
  );
}
