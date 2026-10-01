'use client';

/** Arrival dock note — the Unbox floor, at carton grain. */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { toast } from '@/lib/toast';
import { shouldUseUnmatchedItemsSurface } from '@/lib/receiving/intake-items-routing';
import { WorkspaceNotesCard } from '../workspace/line-edit/WorkspaceNotesCard';
import type { WorkspaceTicketDraftModel } from '../workspace/line-edit/hooks/useWorkspaceTicketDraft';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

export function ArrivalCartonNotesEntry({
  row,
  ticketDraftModel,
  providerTicketId,
  trailingAction,
  onPrimaryAction,
  primaryActionDisabled,
  onOpenStatusHistory,
}: {
  row: ReceivingLineRow;
  ticketDraftModel: WorkspaceTicketDraftModel;
  providerTicketId?: number | null;
  /** Station terminal (Save for unbox) — the composer's bottom-right CTA. */
  trailingAction?: ReactNode;
  /** Enter → the same action the trailing CTA fires (chat Send grammar). */
  onPrimaryAction?: () => void;
  primaryActionDisabled?: boolean;
  /** Header ⓘ → Arrival Displays → Timeline (scans · stamps · audit). */
  onOpenStatusHistory?: () => void;
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
      ticketDraftModel={ticketDraftModel}
      row={row}
      noteGrain="carton"
      // `isUnfound` gates the synced-PO insert: an unfound carton has no PO
      // header to push a note to, same rule Unbox applies.
      c={{
        itemNote: draft,
        setItemNote: setDraft,
        patch,
        zendeskTrimmed: row.zendesk_ticket,
        providerTicketId,
        isUnfound: shouldUseUnmatchedItemsSurface(row),
      }}
      chrome="raised"
      trailingAction={trailingAction}
      onPrimaryAction={onPrimaryAction}
      primaryActionDisabled={primaryActionDisabled}
      onOpenStatusHistory={onOpenStatusHistory}
    />
  );
}
