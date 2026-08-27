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
 * ## Unfound contents
 *
 * An unfound carton has no PO line list to check against — the operator is
 * *creating* the line. When the selected row is still a stub (`id <= 0`), the
 * dock opens the shared CartonAddPopover (Item · Web) → `addUnmatchedLine`.
 * Once a real line exists, the same "Contents match" ack as found cartons.
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
import { Check, Loader2, Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { emitReceiving } from '@/components/receiving/receiving-events';
import {
  CartonAddPopover,
  type CartonAddSelection,
} from '@/components/receiving/workspace/CartonAddPopover';
import {
  dispatchLineUpdated,
  dispatchSelectLine,
} from '@/components/station/receiving-lines-table-helpers';
import { shouldUseLocalReceiveOnly } from '@/lib/receiving/intake-items-routing';
import { addUnmatchedLine } from '@/lib/receiving/add-unmatched-line-client';
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
    // Flush Band 1 segment — full height · full width · no gap air.
    // The cue line above the dock already names the step.
    <div className="flex h-11 w-full min-w-0 items-stretch gap-0">
      {acknowledged ? (
        <Button
          variant="secondary"
          size="sm"
          disabled={saving}
          ariaLabel={`Reopen: ${prompt}`}
          icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
          onClick={() => void run(false)}
          className="h-full w-full min-w-0 justify-center rounded-none"
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
          className="h-full w-full min-w-0 justify-center rounded-none"
        >
          {confirmLabel}
        </Button>
      )}
    </div>
  );
}

/**
 * Unfound stub — identify the item (create unmatched line) before contents ack.
 * Reuses CartonAddPopover + addUnmatchedLine; never a second search engine.
 */
function UnfoundContentsCreateControl({
  row,
  receivingId,
  sourcePlatformHint,
}: {
  row: UnboxStepDockContext['row'];
  receivingId: number;
  sourcePlatformHint: string | null | undefined;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const onAddLine = useCallback(
    async (sel: CartonAddSelection) => {
      if (!receivingId || receivingId <= 0) return;
      setSaving(true);
      try {
        const line = await addUnmatchedLine({
          receivingId,
          selection: sel,
          sourcePlatformHint: sourcePlatformHint || undefined,
          queryClient,
          onLinked: ({ line: created }) => {
            if (created?.id) {
              // Promote the stub selection to the new inventory line (same
              // shape as TriageClassifySection repair identify).
              dispatchSelectLine({
                ...row,
                id: created.id,
                sku: created.sku ?? row.sku,
                item_name: created.item_name ?? row.item_name,
                quantity_expected: created.quantity_expected,
                quantity_received: created.quantity_received,
                condition_grade: created.condition_grade ?? row.condition_grade,
              });
              dispatchLineUpdated({
                id: created.id,
                sku: created.sku,
                item_name: created.item_name,
              });
            }
          },
        });
        if (line?.id) setOpen(false);
      } finally {
        setSaving(false);
        setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
      }
    },
    [queryClient, receivingId, row, sourcePlatformHint],
  );

  return (
    <div className="flex h-11 w-full min-w-0 items-stretch gap-0" data-unbox-contents-create>
      <Button
        variant="primary"
        size="sm"
        disabled={saving || receivingId <= 0}
        ariaLabel="Identify item — add unmatched line for this carton"
        icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        onClick={() => setOpen(true)}
        className="h-full w-full min-w-0 justify-center rounded-none"
      >
        Identify item
      </Button>
      {open ? (
        <CartonAddPopover
          tabs={['item', 'web']}
          initialTab="item"
          unitIds={[]}
          onAddLine={onAddLine}
          addLineHint="Creates the unmatched inventory line for this carton."
          onClose={() => {
            setOpen(false);
            setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
          }}
        />
      ) : null}
    </div>
  );
}

/** `contents` — the operator read this carton's line list against the box. */
export function ContentsDockControl({ row, receivingId }: UnboxStepDockContext) {
  const queryClient = useQueryClient();
  const confirmed = !!row.contents_confirmed_at;
  const lineId = row.id;
  const needsUnfoundCreate = shouldUseLocalReceiveOnly(row) && lineId <= 0;

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
        // Stamp is carton-level on the server; the bench row carries the joined
        // field for the gate. Optimistic patch flips the pointer in-frame (same
        // shape as LabelDockControl); feed invalidate reconciles siblings.
        if (lineId > 0) {
          dispatchLineUpdated({
            id: lineId,
            contents_confirmed_at: next ? new Date().toISOString() : null,
          });
        }
        invalidateReceivingFeeds(queryClient);
      } catch {
        // Teach, don't 500 the step: the line list is still readable and the
        // operator can retry. A silent failure would leave the step pending with
        // no reason given.
        toast.error('Could not record the contents check.');
      }
    },
    [queryClient, receivingId, lineId],
  );

  if (needsUnfoundCreate) {
    return (
      <UnfoundContentsCreateControl
        row={row}
        receivingId={receivingId}
        sourcePlatformHint={row.source_platform}
      />
    );
  }

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
