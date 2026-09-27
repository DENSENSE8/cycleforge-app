'use client';

/** WorkspaceNotesCard — the auto-saving carton Notes composer. */

import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';
import type { ReactNode } from 'react';
import { LineNotesCard } from './LineNotesCard';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { StationComposerMode } from '@/lib/composer/station-composer-mode';

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
  /**
   * Which note buffer this composer owns — see the GRAIN block above. Defaults
   * to the line item note; Arrival's door bench passes `'carton'`.
   */
  noteGrain?: 'line' | 'carton';
  /** Pass-through to OmnichannelComposerDock mount motion. */
  animateMount?: boolean;
  /**
   * Pass-through to OmnichannelComposerDock. `raised` is the floor face on
   * every station that mounts this composer as its dock; `bare` is for a host
   * that already paints the plane, so only one raised shell exists.
   */
  chrome?: 'raised' | 'bare';
  /**
   * Pass-through to OmnichannelComposerDock. Set while this station has a
   * feedback panel welded to the composer's top edge (Unbox receive), so the
   * dock drops its top radius and the pair reads as one shape.
   */
  weldTop?: boolean;
  /** Terminal CTA for the composer's trailing edge (Unbox overview receive). */
  trailingAction?: ReactNode;
  /** Enter → same primary as the trailing Receive CTA (print + receive). */
  onPrimaryAction?: () => void;
  /** Mirrors the disabled Receive pill so Enter is a no-op when blocked. */
  primaryActionDisabled?: boolean;
  /**
   * Open this station's Displays → Locations leaf (the footer location pill's
   * **New location**). Omitted on a surface with no Displays column — the menu
   * item then says so instead of pretending.
   */
  onOpenLocations?: () => void;
  /** Header ⓘ → this station's Displays → Timeline leaf (see LineNotesCard). */
  onOpenStatusHistory?: () => void;
  /**
   * Repoint the header ⓘ (dev receive-panel tester). Outranks
   * {@link onOpenStatusHistory} — see the prop's docblock on LineNotesCard.
   */
  headerAction?: { label: string; onClick: () => void; pressed?: boolean };
  onComposerModeChange?: (mode: StationComposerMode) => void;
  /** Ticket draft has a body — drives the carton-context draft number badge. */
  onTicketDraftFilledChange?: (filled: boolean) => void;
  onComposerFocus?: () => void;
  /** Procedure fill for the composer bottom-right {@link ScanStationProgressRing}. */
  progressPercent?: number;
  progressTone?: 'idle' | 'selected';
  onProgressClick?: () => void;
  /**
   * A claim filed from the composer's Ticket tab. Same handler the claim form
   * used — the dock now files on an unlinked carton, so the station still has
   * to hear about the new ticket number.
   */
  onTicketCreated?: (ticketNumber: string) => void;
  /**
   * The operator typed into the note field. Unbox opens the Label band on this
   * so the sticker face shows the note as it is being written.
   */
  onNoteTyped?: () => void;
}

export function WorkspaceNotesCard({
  row,
  c,
  noteGrain = 'line',
  animateMount = true,
  chrome = 'raised',
  weldTop = false,
  trailingAction,
  onPrimaryAction,
  primaryActionDisabled,
  onOpenLocations,
  onOpenStatusHistory,
  headerAction,
  onComposerModeChange,
  onTicketDraftFilledChange,
  onComposerFocus,
  progressPercent,
  progressTone,
  onProgressClick,
  onTicketCreated,
  onNoteTyped,
}: WorkspaceNotesCardProps) {
  return (
    <div id="zoho-notes-card">
      <LineNotesCard
        row={row}
        onTicketCreated={onTicketCreated}
        onNoteTyped={onNoteTyped}
        notes={c.itemNote}
        overallZohoNotes={row.receiving_zoho_notes ?? null}
        skuTitle={resolveSkuIdentityTitle(row) || null}
        unitPrice={row.unit_price ?? null}
        zendeskTicket={c.zendeskTrimmed || row.zendesk_ticket || null}
        zendeskProviderTicketId={c.providerTicketId}
        zendeskTicketSubject={c.supportTicket?.subject ?? null}
        previousLineNotes={c.prevLineNotes}
        lineId={row.id}
        receivingId={row.receiving_id ?? null}
        onNotesChange={c.setItemNote}
        onSaveNotes={(override) => {
          // Returns whether it actually persisted, so the card only flashes "Saved" when the note changed.
          const next = override ?? c.itemNote;
          if (override != null && override !== c.itemNote) c.setItemNote(override);
          const committed =
            noteGrain === 'carton' ? row.receiving_support_notes || '' : row.notes || '';
          if (next === committed) return false;
          void c.patch(noteGrain === 'carton' ? { support_notes: next } : { notes: next });
          return true;
        }}
        showSyncToPo={!(c.isUnfound ?? false)}
        animateMount={animateMount}
        chrome={chrome}
        weldTop={weldTop}
        trailingAction={trailingAction}
        onPrimaryAction={onPrimaryAction}
        primaryActionDisabled={primaryActionDisabled}
        onOpenLocations={onOpenLocations}
        onOpenStatusHistory={onOpenStatusHistory}
        headerAction={headerAction}
        onComposerModeChange={onComposerModeChange}
        onTicketDraftFilledChange={onTicketDraftFilledChange}
        onComposerFocus={onComposerFocus}
        progressPercent={progressPercent}
        progressTone={progressTone}
        onProgressClick={onProgressClick}
        statusStamps={{
          received_at: row.received_at,
          received_by_name: row.received_by_name,
          unbox_opened_at: row.unbox_opened_at,
          unboxed_at: row.unboxed_at,
          unboxed_by_name: row.unboxed_by_name,
          received_done_at: row.received_done_at,
          label_printed_at: row.label_printed_at,
          staged_at: row.staged_at,
          staged_location_id: row.staged_location_id,
          staged_location_name: row.staged_location_name,
          staged_location_barcode: row.staged_location_barcode,
          staged_location_room: row.staged_location_room,
          // Snapshot + actor: what the operator confirmed, and who confirmed it.
          staged_location_code: row.staged_location_code,
          staged_by_name: row.staged_by_name,
        }}
      />
    </div>
  );
}
