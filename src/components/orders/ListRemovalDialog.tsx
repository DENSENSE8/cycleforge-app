'use client';

/**
 * The reason dialog — a verb that needs a why (RecordActionStrip `dialog`,
 * operator 2026-10-08): the reasons as large chips; an optional note (required
 * for the reasons that say so); then ONE confirm. Picking a reason moves focus
 * to the confirm (or to the note when the reason needs one), so Enter confirms
 * — the verb's own key never does. The write's Undo rides the bottom-right
 * toast, and the dialog turns to its done face.
 *
 * `ReasonDialog` is the face; `ListRemovalDialog` is Remove from list for
 * orders (`src/lib/orders/list-removal.ts`), which the Records dock and the
 * Live feed share. The Live feed's Flag and its unlinked-card Remove from list
 * wear the same face with their own catalogs.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Archive } from '@/components/Icons';
import { Button, type ButtonVariant } from '@/design-system/primitives/Button';
import { TextField } from '@/design-system/primitives/TextField';
import { VerbDoneState } from '@/design-system/components/record-action-strip/VerbDoneState';
import { useSettleOnClose } from '@/design-system/components/record-action-strip/useSettleOnClose';
import {
  LIST_REMOVAL_NOTE_MAX,
  LIST_REMOVAL_NOTE_REQUIRED,
  LIST_REMOVAL_REASONS,
  type ListRemovalReason,
} from '@/lib/orders/list-removal';

export interface ReasonChoice<R extends string> {
  id: R;
  label: string;
  hint: string;
}

export interface ReasonDialogProps<R extends string> {
  /** The line over the chips — what happens, then "why?". */
  prompt: string;
  reasons: readonly ReasonChoice<R>[];
  noteRequired: (reason: R) => boolean;
  noteMax: number;
  /** The confirm's text once a reason is picked (`Remove 2 from the list`). */
  confirmLabel: string;
  confirmIcon: ReactNode;
  confirmVariant: ButtonVariant;
  /** The ghost way out (`Keep it on the list`). */
  cancelLabel: string;
  /** The done face's title for the count the write took. */
  doneTitle: (count: number) => string;
  /** `data-testid` prefix: `<testId>`, `-reason-<id>`, `-note`, `-confirm`, `-done`. */
  testId: string;
  /** The write; resolves to how many records it took, or null when it failed (its toast says why). */
  onConfirm: (reason: R, note: string | null) => Promise<number | null>;
  done: () => void;
  /** A host whose write empties its selection settles once the done face closes (`useSettleOnClose`). */
  onSettled?: () => void;
}

export function ReasonDialog<R extends string>({
  prompt,
  reasons,
  noteRequired,
  noteMax,
  confirmLabel,
  confirmIcon,
  confirmVariant,
  cancelLabel,
  doneTitle,
  testId,
  onConfirm,
  done,
  onSettled,
}: ReasonDialogProps<R>) {
  const [reason, setReason] = useState<R | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [landed, setLanded] = useState<{ count: number; reason: R } | null>(null);
  const settled = useSettleOnClose(onSettled);
  const chipsRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const noteId = useId();
  const needsNote = reason != null && noteRequired(reason);
  const ready = reason != null && (!needsNote || note.trim() !== '') && !busy;

  // Opens on the first reason; a picked reason hands focus on to the note it needs, else to the confirm.
  useEffect(() => {
    chipsRef.current?.querySelector<HTMLButtonElement>('[role="radio"]')?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (reason == null) return;
    if (needsNote) document.getElementById(noteId)?.focus({ preventScroll: true });
    else confirmRef.current?.focus({ preventScroll: true });
  }, [reason, needsNote, noteId]);

  const confirm = async () => {
    if (!ready || reason == null) return;
    setBusy(true);
    try {
      const count = await onConfirm(reason, note.trim() || null);
      if (count != null) {
        settled.current = true;
        setLanded({ count, reason });
      }
    } finally {
      setBusy(false);
    }
  };

  if (landed) {
    return (
      <VerbDoneState
        title={doneTitle(landed.count)}
        detail={reasons.find((entry) => entry.id === landed.reason)?.label ?? landed.reason}
        onDone={done}
        testId={`${testId}-done`}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-testid={testId}>
      <p className="text-role-caption text-text-soft">{prompt}</p>
      <div
        ref={chipsRef}
        role="radiogroup"
        aria-label="Reason"
        className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2"
      >
        {reasons.map((entry) => {
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
              data-testid={`${testId}-reason-${entry.id}`}
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
        onChange={(next) => setNote(next.slice(0, noteMax))}
        multiline
        rows={2}
        onKeyDown={(event) => {
          // Enter confirms from the note too; Shift+Enter is a new line.
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          void confirm();
        }}
        data-testid={`${testId}-note`}
      />
      <div className="flex flex-col gap-1.5 border-t border-border-soft pt-3">
        <Button
          ref={confirmRef}
          type="button"
          variant={confirmVariant}
          size="md"
          icon={confirmIcon}
          className="w-full"
          disabled={!ready}
          loading={busy}
          onClick={() => void confirm()}
          data-testid={`${testId}-confirm`}
        >
          {reason == null ? 'Pick a reason' : confirmLabel}
        </Button>
        <p className="text-center text-role-micro text-text-soft">Enter confirms · Undo stays on the toast</p>
        <Button type="button" variant="ghost" size="sm" className="w-full" onClick={done}>
          {cancelLabel}
        </Button>
      </div>
    </div>
  );
}

/** Remove from list for orders — off the To-ship list with a reason (`order_list_removals`). */
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
  onSettled?: () => void;
}) {
  return (
    <ReasonDialog
      prompt={`${count} order${count === 1 ? '' : 's'} leave${count === 1 ? 's' : ''} the To-ship list — why?`}
      reasons={LIST_REMOVAL_REASONS}
      noteRequired={(reason) => LIST_REMOVAL_NOTE_REQUIRED.has(reason)}
      noteMax={LIST_REMOVAL_NOTE_MAX}
      confirmLabel={`Remove ${count} from the list`}
      confirmIcon={<Archive />}
      confirmVariant="danger"
      cancelLabel={`Keep ${count === 1 ? 'it' : 'them'} on the list`}
      doneTitle={(removed) => `Removed ${removed} from the list`}
      testId="list-removal"
      onConfirm={onConfirm}
      done={done}
      onSettled={onSettled}
    />
  );
}
