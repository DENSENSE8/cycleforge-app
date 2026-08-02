'use client';

/**
 * WorkspaceNotesCard — the auto-saving carton Notes composer.
 *
 * Extracted from {@link LineEditPanel} so the Unbox panel and the standalone
 * {@link TriagePanel} share ONE notes implementation. Pure composition over the
 * controller bag; the panel owns placement (dock vs mid-canvas).
 *
 * GRAIN: this composer owns the **item note** (`receiving_line.notes`) — the
 * operator's durable note on this line. It does **not** print. The printed face
 * is a separate buffer (`receiving_line.label_note`) edited in the label editor
 * (`LabelEditPopover` / As Listed); see the two-buffer note in
 * `useUnboxLineController`. Until 2026-07-31 these were one column, so a note
 * could not be written without printing it.
 *
 * It hydrates from the row and saves on blur / Send. With the overview Receive
 * CTA mounted, Enter saves then fires print+receive.
 *
 * Built on {@link OmnichannelComposerDock}. The full view / reload / overwrite of
 * the synced PO note lives in the standalone "PO note" display tab
 * ({@link LinePoNoteCard}).
 */

import type { ReactNode } from 'react';
import { LineNotesCard } from './LineNotesCard';
import { useSyncedPoNote } from './hooks/useSyncedPoNote';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { InlineActionFeedbackPayload } from '../InlineActionFeedbackCard';
import type { UnboxLineController } from './unbox-line-controller';

interface WorkspaceNotesCardProps {
  row: ReceivingLineRow;
  c: UnboxLineController;
  onActionFeedback: (feedback: InlineActionFeedbackPayload | null) => void;
  /** Pass-through to OmnichannelComposerDock mount motion. */
  animateMount?: boolean;
  /** Terminal CTA for the composer's trailing edge (Unbox overview receive). */
  trailingAction?: ReactNode;
  /** Enter → same primary as the trailing Receive CTA (print + receive). */
  onPrimaryAction?: () => void;
  /** Mirrors the disabled Receive pill so Enter is a no-op when blocked. */
  primaryActionDisabled?: boolean;
}

export function WorkspaceNotesCard({
  row,
  c,
  onActionFeedback,
  animateMount = true,
  trailingAction,
  onPrimaryAction,
  primaryActionDisabled,
}: WorkspaceNotesCardProps) {
  const { saveOverallNote } = useSyncedPoNote(row, onActionFeedback);
  return (
    <div id="zoho-notes-card">
      <LineNotesCard
        notes={c.itemNote}
        overallZohoNotes={row.receiving_zoho_notes ?? null}
        skuTitle={row.zoho_item_title || row.item_name || null}
        unitPrice={row.unit_price ?? null}
        zendeskTicket={c.zendeskTrimmed || row.zendesk_ticket || null}
        zendeskProviderTicketId={c.providerTicketId}
        zendeskTicketSubject={c.supportTicket?.subject ?? null}
        previousLineNotes={c.prevLineNotes}
        onNotesChange={c.setItemNote}
        onSaveNotes={() => {
          // Returns whether it actually persisted, so the card only flashes
          // "Saved" when the note changed. Writes `notes` ONLY — the printed
          // face (`label_note`) is never touched from this composer.
          const next = c.itemNote;
          if (next === (row.notes || '')) return false;
          void c.patch({ notes: next });
          return true;
        }}
        onSaveOverallNote={saveOverallNote}
        showSyncToPo={!c.isUnfound}
        animateMount={animateMount}
        trailingAction={trailingAction}
        onPrimaryAction={onPrimaryAction}
        primaryActionDisabled={primaryActionDisabled}
      />
    </div>
  );
}
