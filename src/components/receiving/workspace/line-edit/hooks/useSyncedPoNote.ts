'use client';

import { useCallback } from 'react';
import { dispatchLineUpdated, type ReceivingLineRow } from '@/components/station/ReceivingLinesTable';
import type { InlineActionFeedbackPayload } from '../../InlineActionFeedbackCard';

function zohoPoNotesSkipNote(zoho?: { patched?: boolean; skipped?: string }): string | undefined {
  switch (zoho?.skipped) {
    case 'no_zoho_link':
      return 'Saved locally — no PO link on this carton.';
    case 'po_not_editable':
      return 'Saved locally — the synced PO is not editable.';
    default:
      return undefined;
  }
}

/**
 * Shared handler to persist the carton-level synced PO note (overwrite + push to
 * the inventory PO field) and surface the result in the workspace feedback slot.
 *
 * Used by BOTH the notes composer's "push to PO" button ({@link WorkspaceNotesCard})
 * and the standalone "PO note" display tab ({@link LinePoNoteCard}), so the ~40-line
 * PATCH + feedback path lives in exactly one place.
 */
export function useSyncedPoNote(
  row: ReceivingLineRow,
  onActionFeedback: (feedback: InlineActionFeedbackPayload | null) => void,
) {
  const saveOverallNote = useCallback(
    async (text: string) => {
      if (row.receiving_id == null) return;
      onActionFeedback(null);
      try {
        const res = await fetch(`/api/receiving/${row.receiving_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ zoho_notes: text, push_to_zoho: true }),
        });
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          zoho?: { patched?: boolean; skipped?: string };
        } | null;
        if (res.ok) {
          dispatchLineUpdated({ id: row.id, receiving_zoho_notes: text || null });
          onActionFeedback({
            tone: 'emerald',
            headline: text ? 'Synced notes updated' : 'Synced notes cleared',
            // Show the FULL PO notes (multi-line, pre-wrapped) so the operator sees
            // exactly what landed in inventory — not a truncated first-line preview.
            items: text ? [text] : [],
            note: data?.zoho?.patched ? undefined : zohoPoNotesSkipNote(data?.zoho),
            at: Date.now(),
          });
        } else {
          onActionFeedback({
            tone: 'amber',
            headline: 'Could not save synced notes',
            items: [],
            note: data?.error?.trim() || 'Save failed',
            at: Date.now(),
          });
        }
      } catch {
        onActionFeedback({
          tone: 'amber',
          headline: 'Could not save synced notes',
          items: [],
          note: 'Save failed',
          at: Date.now(),
        });
      }
    },
    [row.receiving_id, row.id, onActionFeedback],
  );

  return { saveOverallNote };
}
