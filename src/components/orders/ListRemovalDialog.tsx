'use client';

/**
 * Remove from list — the selection verb's centered dialog (RecordActionStrip
 * `dialog`, operator 2026-10-08): why, as large reason chips; an optional note;
 * then ONE confirm. Picking a reason moves focus to the confirm (or to the note
 * when the reason needs one), so Enter confirms — the verb's own key never
 * does. The Records dock and the Live feed take an order off the To-ship list
 * the same way (`src/lib/orders/list-removal.ts`); the write's Undo rides the
 * bottom-right toast, and the dialog turns to its done face.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { Archive } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import { TextField } from '@/design-system/primitives/TextField';
import { VerbDoneState } from '@/design-system/components/record-action-strip/VerbDoneState';
import { useSettleOnClose } from '@/design-system/components/record-action-strip/useSettleOnClose';
import {
  LIST_REMOVAL_NOTE_MAX,
  LIST_REMOVAL_NOTE_REQUIRED,
  LIST_REMOVAL_REASONS,
  listRemovalReasonLabel,
  type ListRemovalReason,
} from '@/lib/orders/list-removal';

export function ListRemovalDialog({
  count,
  onConfirm,
  done,
  onSettled,
}: {
  count: number;
  /** The write; resolves to how many orders left the list, or null when it failed (its toast says why). */
  onConfirm: (reason: ListRemovalReason, note: string | null) => Promise<number | null>;
  done: () => void;
  /** A host whose write empties its selection settles once the done face closes (`useSettleOnClose`). */
  onSettled?: () => void;
}) {
  const [reason, setReason] = useState<ListRemovalReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [removed, setRemoved] = useState<{ count: number; reason: ListRemovalReason } | null>(null);
  const landed = useSettleOnClose(onSettled);
  const chipsRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const noteId = useId();
  const needsNote = reason != null && LIST_REMOVAL_NOTE_REQUIRED.has(reason);
  const ready = reason != null && (!needsNote || note.trim() !== '') && !busy;

  // Opens on the first reason; a picked reason hands focus on to the note it needs, else to the confirm.
  useEffect(() => {
    chipsRef.current?.querySelector<HTMLButtonElement>('[role="radio"]')?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (reason == null) return;
    if (LIST_REMOVAL_NOTE_REQUIRED.has(reason)) document.getElementById(noteId)?.focus({ preventScroll: true });
    else confirmRef.current?.focus({ preventScroll: true });
  }, [reason, noteId]);

  const confirm = async () => {
    if (!ready || reason == null) return;
    setBusy(true);
    try {
      const left = await onConfirm(reason, note.trim() || null);
      if (left != null) {
        landed.current = true;
        setRemoved({ count: left, reason });
      }
    } finally {
      setBusy(false);
    }
  };

  if (removed) {
    return (
      <VerbDoneState
        title={`Removed ${removed.count} from the list`}
        detail={listRemovalReasonLabel(removed.reason)}
        onDone={done}
        testId="list-removal-done"
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-testid="list-removal-dialog">
      <p className="text-role-caption text-text-soft">
        {count} order{count === 1 ? '' : 's'} leave{count === 1 ? 's' : ''} the To-ship list — why?
      </p>
      <div
        ref={chipsRef}
        role="radiogroup"
        aria-label="Reason"
        className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2"
      >
        {LIST_REMOVAL_REASONS.map((entry) => {
          const on = reason === entry.id;
          return (
            <Button
              key={entry.id}
              type="button"
              role="radio"
              aria-checked={on}
              variant={on ? 'primarySoft' : 'secondary'}
              size="lg"
              className="h-auto min-h-14 w-full flex-col items-start justify-center gap-0.5 py-2 text-left"
              onClick={() => setReason(entry.id)}
              data-testid={`list-removal-reason-${entry.id}`}
            >
              <span className="text-sm font-semibold">{entry.label}</span>
              <span className="text-role-micro font-normal text-text-soft">{entry.hint}</span>
            </Button>
          );
        })}
      </div>
      <TextField
        id={noteId}
        label={needsNote ? 'Note (required)' : 'Note (optional)'}
        value={note}
        onChange={(next) => setNote(next.slice(0, LIST_REMOVAL_NOTE_MAX))}
        multiline
        rows={2}
        onKeyDown={(event) => {
          // Enter confirms from the note too; Shift+Enter is a new line.
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          void confirm();
        }}
        data-testid="list-removal-note"
      />
      <div className="flex flex-col gap-1.5 border-t border-border-soft pt-3">
        <Button
          ref={confirmRef}
          type="button"
          variant="danger"
          size="md"
          icon={<Archive />}
          className="w-full"
          disabled={!ready}
          loading={busy}
          onClick={() => void confirm()}
          data-testid="list-removal-confirm"
        >
          {reason == null ? 'Pick a reason' : `Remove ${count} from the list`}
        </Button>
        <p className="text-center text-role-micro text-text-soft">Enter confirms · Undo stays on the toast</p>
        <Button type="button" variant="ghost" size="sm" className="w-full" onClick={done}>
          Keep {count === 1 ? 'it' : 'them'} on the list
        </Button>
      </div>
    </div>
  );
}
