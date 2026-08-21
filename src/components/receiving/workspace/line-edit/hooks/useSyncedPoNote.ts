'use client';

import { useCallback } from 'react';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { toast } from '@/lib/toast';
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

export type SaveOverallNoteOptions = {
  /** Stamp from last trusted Inventory pull — enables block-if-stale on Zoho push. */
  baseLastModifiedZoho?: string | null;
};

export type SaveOverallNoteResult = {
  ok: boolean;
  stale?: boolean;
  liveLastModifiedZoho?: string | null;
};

/**
 * Shared handler to persist the carton-level synced PO note (overwrite + push to
 * the inventory PO field) and surface the result in the workspace feedback slot.
 *
 * Used by the standalone "PO note" display tab ({@link LinePoNoteCard}), so the
 * PATCH + feedback path lives in exactly one place.
 */
export function useSyncedPoNote(
  row: ReceivingLineRow,
  onActionFeedback: (feedback: InlineActionFeedbackPayload | null) => void,
) {
  const saveOverallNote = useCallback(
    async (
      text: string,
      opts?: SaveOverallNoteOptions,
    ): Promise<SaveOverallNoteResult> => {
      if (row.receiving_id == null) return { ok: false };
      onActionFeedback(null);
      try {
        const body: Record<string, unknown> = {
          zoho_notes: text,
          push_to_zoho: true,
        };
        if (opts && Object.prototype.hasOwnProperty.call(opts, 'baseLastModifiedZoho')) {
          body.base_last_modified_zoho = opts.baseLastModifiedZoho ?? null;
        }
        const res = await fetch(`/api/receiving/${row.receiving_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          stale?: boolean;
          live_last_modified_zoho?: string | null;
          zoho?: { patched?: boolean; skipped?: string };
        } | null;

        if (res.status === 409 || data?.stale || data?.zoho?.skipped === 'stale') {
          const msg = data?.error?.trim() || 'Inventory changed — Refresh';
          toast.warning(msg, {
            description: 'Your draft is kept. Refresh, then save again.',
          });
          onActionFeedback({
            tone: 'warning',
            headline: 'Inventory changed — Refresh',
            items: [],
            note: 'Draft kept — do not overwrite until you pull the latest inventory state.',
            at: Date.now(),
          });
          return {
            ok: false,
            stale: true,
            liveLastModifiedZoho: data?.live_last_modified_zoho ?? null,
          };
        }

        if (res.ok) {
          dispatchLineUpdated({ id: row.id, receiving_zoho_notes: text || null });
          onActionFeedback({
            tone: 'success',
            headline: text ? 'Synced notes updated' : 'Synced notes cleared',
            // Show the FULL PO notes (multi-line, pre-wrapped) so the operator sees
            // exactly what landed in inventory — not a truncated first-line preview.
            items: text ? [text] : [],
            note: data?.zoho?.patched ? undefined : zohoPoNotesSkipNote(data?.zoho),
            at: Date.now(),
          });
          return {
            ok: true,
            liveLastModifiedZoho: data?.live_last_modified_zoho ?? null,
          };
        }

        onActionFeedback({
          tone: 'warning',
          headline: 'Could not save synced notes',
          items: [],
          note: data?.error?.trim() || 'Save failed',
          at: Date.now(),
        });
        return { ok: false };
      } catch {
        onActionFeedback({
          tone: 'warning',
          headline: 'Could not save synced notes',
          items: [],
          note: 'Save failed',
          at: Date.now(),
        });
        return { ok: false };
      }
    },
    [row.receiving_id, row.id, onActionFeedback],
  );

  return { saveOverallNote };
}
