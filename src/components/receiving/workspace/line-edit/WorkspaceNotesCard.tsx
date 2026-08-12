'use client';

/**
 * WorkspaceNotesCard — the auto-saving carton Notes composer.
 *
 * Extracted from {@link LineEditPanel} so the Unbox panel and the standalone
 * {@link TriagePanel} share ONE notes implementation. Pure composition over the
 * controller bag; the panel owns placement (dock vs mid-canvas).
 *
 * GRAIN: this composer owns the **item note** (`receiving_line.notes`) — the
 * operator's durable note on this line (Zoho / receive payload). On Unbox
 * overview the dock draft also live-drives the carton sticker center; save
 * still patches `notes` only. Durable `label_note` is edited in the label
 * editor (`LabelEditPopover` / As Listed) and stamped from the dock draft on
 * carton print — see the two-buffer note in `useUnboxLineController`.
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

/**
 * Minimal notes contract — Unbox + Testing (+ Arrival) compose the same dock
 * without hard-wiring `UnboxLineController`.
 */
type WorkspaceNotesController = {
  itemNote: string;
  setItemNote: (next: string) => void;
  patch: (body: Record<string, unknown>) => void | Promise<unknown>;
  zendeskTrimmed?: string | null;
  providerTicketId?: number | null;
  supportTicket?: { subject?: string | null } | null;
  prevLineNotes?: string;
  isUnfound?: boolean;
};

interface WorkspaceNotesCardProps {
  row: ReceivingLineRow;
  c: WorkspaceNotesController;
  onActionFeedback: (feedback: InlineActionFeedbackPayload | null) => void;
  /** Pass-through to OmnichannelComposerDock mount motion. */
  animateMount?: boolean;
  /**
   * Pass-through to OmnichannelComposerDock. UnboxDockHost nests this as a
   * notes-mode zone and must pass `bare` so the host is the only raised shell.
   */
  chrome?: 'raised' | 'bare';
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
  chrome = 'raised',
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
        lineId={row.id}
        onNotesChange={c.setItemNote}
        onSaveNotes={(override) => {
          // Returns whether it actually persisted, so the card only flashes
          // "Saved" when the note changed. Writes `notes` ONLY — the printed
          // face (`label_note`) is never touched from this composer. Optional
          // override covers Enter that also accepts a ghost suggestion.
          const next = override ?? c.itemNote;
          if (override != null && override !== c.itemNote) c.setItemNote(override);
          if (next === (row.notes || '')) return false;
          void c.patch({ notes: next });
          return true;
        }}
        onSaveOverallNote={saveOverallNote}
        showSyncToPo={!(c.isUnfound ?? false)}
        animateMount={animateMount}
        chrome={chrome}
        trailingAction={trailingAction}
        onPrimaryAction={onPrimaryAction}
        primaryActionDisabled={primaryActionDisabled}
      />
    </div>
  );
}
