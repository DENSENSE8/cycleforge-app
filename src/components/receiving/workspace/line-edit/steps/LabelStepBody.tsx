'use client';

/**
 * The `label` step body — read the face this carton is about to print, and say
 * so.
 *
 * ## There is ONE label surface, and this is it
 *
 * The preview used to render as a sibling BELOW the procedure column, which is
 * how it came to slide under the composer dock: it was outside the stack the
 * dock reserves clearance for. Folding it into its own step fixes the overlap
 * and answers the question the sibling could not — *when* in the job is the
 * operator supposed to look at this? Right before the dock prints it.
 *
 * `print` stays a COMMIT step on the terminal dock. This step is the reading;
 * that one is the act.
 *
 * ## The acknowledgement is the fact
 *
 * Every other capture step derives from evidence the carton carries — a photo at
 * a stage and aspect, a serial, a grade. Reading a label leaves nothing behind,
 * so `receiving_line_testing.label_previewed_at` records the only fact there is:
 * a person looked at this face and said it was right. Same shape as
 * `contents_confirmed_at`.
 *
 * That is NOT the hand-ticked checklist deleted 2026-08-01. That list let an
 * operator tick "photographed the packing material" — a claim about EVIDENCE the
 * carton can answer for itself, and therefore must. Nothing here claims evidence
 * exists.
 *
 * ## It hands focus back
 *
 * The confirm button is a real `<button>`: clicking it leaves focus there, and
 * the next wedge scan would type into it. Every pointer control on this surface
 * dispatches `receiving-focus-scan` after it acts.
 */

import { useCallback, useState } from 'react';
import { Check, Loader2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { toast } from '@/lib/toast';
import type { UnboxStepBodyContext } from './types';

export function LabelStepBody({ row, labelSlot }: UnboxStepBodyContext) {
  const [saving, setSaving] = useState(false);
  const previewedAt = row.label_previewed_at ?? null;
  const lineId = row.id;

  const setConfirmed = useCallback(
    async (confirmed: boolean) => {
      if (!lineId || lineId <= 0) return;
      setSaving(true);
      try {
        const res = await fetch(`/api/receiving/lines/${lineId}/label-previewed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmed }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as {
          line?: { label_previewed_at?: string | null };
        };
        // Optimistic-shaped local patch so the column's gate flips in the same
        // frame the operator clicked, rather than after the list refetch.
        dispatchLineUpdated({
          id: lineId,
          label_previewed_at: json.line?.label_previewed_at ?? null,
        });
      } catch {
        // Teach, don't 500 the step: the face is still readable and the operator
        // can retry. A silent failure here would leave the step pending with no
        // reason given.
        toast.error('Could not record the label check.');
      } finally {
        setSaving(false);
        // The wedge owns focus — hand it back after the click settles, same
        // 60ms defer as the other station hand-backs.
        setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
      }
    },
    [lineId],
  );

  return (
    <div className="space-y-3">
      {labelSlot ?? (
        <p className="text-role-caption text-text-soft">No label face for this line yet.</p>
      )}
      <div className="flex items-center justify-end">
        {previewedAt ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={saving}
            onClick={() => void setConfirmed(false)}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Reopen
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            disabled={saving || !labelSlot}
            icon={
              saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )
            }
            onClick={() => void setConfirmed(true)}
          >
            Face is right
          </Button>
        )}
      </div>
    </div>
  );
}
