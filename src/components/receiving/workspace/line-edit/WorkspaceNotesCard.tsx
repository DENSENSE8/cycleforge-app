'use client';

/**
 * WorkspaceNotesCard — the header-less, auto-saving carton Notes composer.
 *
 * Extracted from {@link LineEditPanel} so the Unbox panel and the standalone
 * {@link TriagePanel} share ONE notes implementation. Pure composition over the
 * controller bag; the panel owns the stagger wrapper, this owns the card.
 *
 * The note is ONE durable buffer (`receiving_lines.notes`): it composes the
 * printed label face AND is the operator's saved note. It hydrates from the row
 * and auto-saves on blur (see `useUnboxLineController` / {@link LineNotesCard}),
 * so a reprint carries the same note. The old separate "Label" vs "Internal"
 * buffers and the manual "save to internal" bridge are gone.
 *
 * The composer keeps a bottom-right button that APPENDS the note to the carton's
 * synced PO note (via {@link useSyncedPoNote}). The full view / reload / overwrite
 * of that PO note lives in the standalone "PO note" display tab ({@link LinePoNoteCard}).
 */

import type { ReceivingStepKey } from '../ReceivingProgressStepper';
import { LineNotesCard } from './LineNotesCard';
import { useSyncedPoNote } from './hooks/useSyncedPoNote';
import { type ReceivingLineRow } from '@/components/station/ReceivingLinesTable';
import type { InlineActionFeedbackPayload } from '../InlineActionFeedbackCard';
import type { UnboxLineController } from './unbox-line-controller';

interface WorkspaceNotesCardProps {
  row: ReceivingLineRow;
  c: UnboxLineController;
  onActionFeedback: (feedback: InlineActionFeedbackPayload | null) => void;
  activeStep?: ReceivingStepKey | null;
}

export function WorkspaceNotesCard({ row, c, onActionFeedback, activeStep }: WorkspaceNotesCardProps) {
  const { saveOverallNote } = useSyncedPoNote(row, onActionFeedback);
  return (
    <div id="zoho-notes-card">
      <LineNotesCard
        notes={c.labelNotes}
        overallZohoNotes={row.receiving_zoho_notes ?? null}
        skuTitle={row.zoho_item_title || row.item_name || null}
        unitPrice={row.unit_price ?? null}
        zendeskTicket={c.zendeskTrimmed || row.zendesk_ticket || null}
        zendeskProviderTicketId={c.providerTicketId}
        zendeskTicketSubject={c.supportTicket?.subject ?? null}
        previousLineNotes={c.prevLineNotes}
        onNotesChange={c.setLabelNotes}
        onSaveNotes={() => {
          // Auto-save on blur. Returns whether it actually persisted, so the card
          // only flashes "Saved" when the note changed.
          const next = c.labelNotes;
          if (next === (row.notes || '')) return false;
          void c.patch({ notes: next });
          return true;
        }}
        onSaveOverallNote={saveOverallNote}
        showSyncToPo={!c.isUnfound}
        activeStep={activeStep}
      />
    </div>
  );
}
