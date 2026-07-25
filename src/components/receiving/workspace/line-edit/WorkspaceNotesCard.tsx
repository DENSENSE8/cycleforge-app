'use client';

/**
 * WorkspaceNotesCard — the auto-saving carton Notes composer.
 *
 * Extracted from {@link LineEditPanel} so the Unbox panel and the standalone
 * {@link TriagePanel} share ONE notes implementation. Pure composition over the
 * controller bag; the panel owns placement (dock vs mid-canvas).
 *
 * The note is ONE durable buffer (`receiving_lines.notes`): it composes the
 * printed label face AND is the operator's saved note. It hydrates from the row
 * and saves on blur / Send (see `useUnboxLineController` /
 * {@link LineNotesCard}), so a reprint carries the same note. With the
 * overview Receive CTA mounted, Enter saves then fires print+receive.
 *
 * Built on {@link StationComposerDock}. The full view / reload / overwrite of
 * the synced PO note lives in the standalone "PO note" display tab
 * ({@link LinePoNoteCard}).
 */

import type { ReactNode } from 'react';
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
  /** Pass-through to StationComposerDock mount motion. */
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
  activeStep,
  animateMount = true,
  trailingAction,
  onPrimaryAction,
  primaryActionDisabled,
}: WorkspaceNotesCardProps) {
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
          // Returns whether it actually persisted, so the card only flashes
          // "Saved" when the note changed.
          const next = c.labelNotes;
          if (next === (row.notes || '')) return false;
          void c.patch({ notes: next });
          return true;
        }}
        onSaveOverallNote={saveOverallNote}
        showSyncToPo={!c.isUnfound}
        activeStep={activeStep}
        animateMount={animateMount}
        trailingAction={trailingAction}
        onPrimaryAction={onPrimaryAction}
        primaryActionDisabled={primaryActionDisabled}
      />
    </div>
  );
}
