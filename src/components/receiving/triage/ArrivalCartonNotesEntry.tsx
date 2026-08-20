'use client';

/**
 * Arrival dock note — the Unbox floor, at carton grain.
 *
 * @domain-job Capture a free-text remark about the CARTON at the door, before
 *   anyone opens it ("arrived crushed", "no packing slip", "seal cut"), with the
 *   station's terminal action on the composer's trailing edge.
 * @hardware-target Station
 * @density floor
 * @justification Not a second composer — this file is the carton-grain
 *   CONTROLLER for the shared one. {@link WorkspaceNotesCard} owns the face and
 *   takes `noteGrain="carton"`; all this adds is the draft state and the PATCH
 *   that lands it in `receiving.support_notes`. Arrival has no chosen line, so
 *   it cannot reuse the line-grain controller (`useUnboxLineController`) — but
 *   it must not fork the composer either, and it does not.
 *
 * **Why the display is identical to Unbox's.** It is the same component. Unbox
 * mounts `WorkspaceNotesCard chrome="raised"` with the terminal as
 * {@link trailingAction} — a notes entry with the CTA at its bottom-right — and
 * Arrival now mounts exactly that, with "Save for unbox" in the trailing slot
 * instead of Print · Receive. No two-band dock host, no step-context cell, no
 * progress cell: those were Arrival-only chrome that made the two benches read
 * as different products.
 *
 * **Why `support_notes` and not `receiving_line.notes`.** A door note describes
 * the box. On a multi-line PO, writing the line column would mean silently
 * picking one of N lines, and it would collide with the note the Unbox operator
 * writes later on that same buffer — two stations overwriting one field. The
 * grain split is the house rule (`source-of-truth.md` → Note vs label grain).
 *
 * Commit is Enter / blur — never a scan. This field registers NO scan sink and
 * NO focus target, so the wedge keeps pointing at the sidebar ingest bar.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { toast } from '@/lib/toast';
import { shouldUseUnmatchedItemsSurface } from '@/lib/receiving/intake-items-routing';
import { WorkspaceNotesCard } from '../workspace/line-edit/WorkspaceNotesCard';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

export function ArrivalCartonNotesEntry({
  row,
  trailingAction,
  onPrimaryAction,
  primaryActionDisabled,
}: {
  row: ReceivingLineRow;
  /** Station terminal (Save for unbox) — the composer's bottom-right CTA. */
  trailingAction?: ReactNode;
  /** Enter → the same action the trailing CTA fires (chat Send grammar). */
  onPrimaryAction?: () => void;
  primaryActionDisabled?: boolean;
}) {
  const receivingId = row.receiving_id ?? null;
  const committed = row.receiving_support_notes ?? '';
  const [draft, setDraft] = useState(committed);
  const queryClient = useQueryClient();

  // Re-seed when the dock swaps to a different carton. Keyed on receivingId as
  // well as the value: two cartons can legitimately hold the same note text.
  useEffect(() => {
    setDraft(committed);
  }, [committed, receivingId]);

  /**
   * The carton-grain write. Shape mirrors the Incoming details rail's NotesTab:
   * trim, null out an emptied field. Same PATCH the staging writer uses — no new
   * API was invented for this note.
   */
  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      if (receivingId == null) return;
      const next = typeof body.support_notes === 'string' ? body.support_notes.trim() : null;
      try {
        const res = await fetch(`/api/receiving/${receivingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ support_notes: next || null }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) throw new Error(data?.error || 'save failed');
        invalidateReceivingFeeds(queryClient);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not save the note');
      }
    },
    [receivingId, queryClient],
  );

  return (
    <WorkspaceNotesCard
      row={row}
      noteGrain="carton"
      // `isUnfound` gates the synced-PO insert: an unfound carton has no PO
      // header to push a note to, same rule Unbox applies.
      c={{
        itemNote: draft,
        setItemNote: setDraft,
        patch,
        isUnfound: shouldUseUnmatchedItemsSurface(row),
      }}
      chrome="raised"
      trailingAction={trailingAction}
      onPrimaryAction={onPrimaryAction}
      primaryActionDisabled={primaryActionDisabled}
    />
  );
}
