'use client';

/**
 * The two ACKNOWLEDGEMENT steps' dock controls — `contents` and `label`.
 *
 * ## Why they share one component
 *
 * Both steps are gated on a stamp that records *a person looked at this and said
 * it was right* — `receiving_unbox.contents_confirmed_at` and
 * `receiving_line_testing.label_previewed_at`. Neither leaves evidence of its
 * own behind, so the acknowledgement IS the fact. Same shape, same two states
 * (confirm / reopen), same hand-back; two files would be a fork by copy-paste.
 *
 * ## This is NOT the hand-ticked checklist that was deleted
 *
 * That list let an operator tick "photographed the packing material" — a claim
 * about EVIDENCE the carton can answer for itself, and therefore must. Nothing
 * here claims evidence exists: reading a line list and reading a label face
 * leave no trace, so a person saying they did it is the only fact there is.
 *
 * ## It hands focus back
 *
 * A real `<button>` keeps focus after a click, and the next wedge scan would
 * type into it — whose Enter would re-activate it. 60ms defer, same as the deck,
 * the pager and the pair panel.
 */

import { useCallback, useState } from 'react';
import { Check, Loader2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import type { UnboxStepDockContext } from './types';

function AcknowledgeControl({
  prompt,
  confirmLabel,
  acknowledged,
  disabled,
  onSet,
}: {
  prompt: string;
  confirmLabel: string;
  acknowledged: boolean;
  disabled?: boolean;
  onSet: (next: boolean) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  const run = useCallback(
    async (next: boolean) => {
      setSaving(true);
      try {
        await onSet(next);
      } finally {
        setSaving(false);
        setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
      }
    },
    [onSet],
  );

  return (
    // No prose prompt: this renders inside the composer footer now, and the cue
    // line above the dock already names the step. The button labels are
    // self-describing ("Contents match", "Face is right"); the prompt survives
    // as the accessible label so a screen reader still hears the instruction.
    <div className="flex h-11 min-w-0 items-center gap-2">
      {acknowledged ? (
        <Button
          variant="secondary"
          size="sm"
          disabled={saving}
          ariaLabel={`Reopen: ${prompt}`}
          icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
          onClick={() => void run(false)}
        >
          Reopen
        </Button>
      ) : (
        <Button
          variant="primary"
          size="sm"
          disabled={saving || disabled}
          ariaLabel={`${confirmLabel} — ${prompt}`}
          icon={
            saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-3.5 w-3.5" />
          }
          onClick={() => void run(true)}
        >
          {confirmLabel}
        </Button>
      )}
    </div>
  );
}

/** `contents` — the operator read this carton's line list against the box. */
export function ContentsDockControl({ row, receivingId }: UnboxStepDockContext) {
  const queryClient = useQueryClient();
  const confirmed = !!row.contents_confirmed_at;

  const onSet = useCallback(
    async (next: boolean) => {
      if (!receivingId || receivingId <= 0) return;
      try {
        const res = await fetch(`/api/receiving/${receivingId}/contents-confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmed: next }),
        });
        if (!res.ok) throw new Error(String(res.status));
        // The stamp is CARTON-level, so it does not arrive on this line's row
        // patch — refresh the feeds the derivation reads instead of inventing a
        // local line field the server never sends.
        invalidateReceivingFeeds(queryClient);
      } catch {
        // Teach, don't 500 the step: the line list is still readable and the
        // operator can retry. A silent failure would leave the step pending with
        // no reason given.
        toast.error('Could not record the contents check.');
      }
    },
    [queryClient, receivingId],
  );

  return (
    <AcknowledgeControl
      prompt="Check the box against its line list"
      confirmLabel="Contents match"
      acknowledged={confirmed}
      onSet={onSet}
    />
  );
}

/** `label` — the operator read the face this carton is about to print. */
export function LabelDockControl({ row }: UnboxStepDockContext) {
  const lineId = row.id;
  const previewed = !!row.label_previewed_at;

  const onSet = useCallback(
    async (next: boolean) => {
      if (!lineId || lineId <= 0) return;
      try {
        const res = await fetch(`/api/receiving/lines/${lineId}/label-previewed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmed: next }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as { line?: { label_previewed_at?: string | null } };
        // Optimistic-shaped local patch so the gate flips in the same frame the
        // operator clicked, rather than after the list refetch.
        dispatchLineUpdated({
          id: lineId,
          label_previewed_at: json.line?.label_previewed_at ?? null,
        });
      } catch {
        toast.error('Could not record the label check.');
      }
    },
    [lineId],
  );

  return (
    <AcknowledgeControl
      prompt="Read the face this carton will print"
      confirmLabel="Face is right"
      acknowledged={previewed}
      onSet={onSet}
    />
  );
}
