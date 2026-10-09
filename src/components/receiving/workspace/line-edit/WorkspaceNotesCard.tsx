'use client';

/** WorkspaceNotesCard — the auto-saving carton Notes composer. */

import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';
import type { ReactNode } from 'react';
import { LineNotesCard } from './LineNotesCard';
import type { WorkspaceTicketDraftModel } from './hooks/useWorkspaceTicketDraft';
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
  /** Claim/audience state shared with the center Ticket preview. */
  ticketDraftModel: WorkspaceTicketDraftModel;
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
   * Staff reaction welded onto the composer's top edge (Unbox receive
   * feedback) — pass-through to StationComposerHost `reaction`.
   */
  reaction?: ReactNode;
  /** Terminal CTA for the composer's trailing edge (Unbox overview receive). */
  trailingAction?: ReactNode;
  /** Renders immediately left of the location control in the composer footer. */
  locationLeading?: ReactNode;
  /** The station label peek (see StationLabelPeek): the Label button at the top-left of the row above the composer. */
  labelPeek?: ReactNode;
  /** Enter → same primary as the trailing Receive CTA (print + receive). */
  onPrimaryAction?: () => void;
  /** Mirrors the disabled Receive pill so Enter is a no-op when blocked. */
  primaryActionDisabled?: boolean;
  /** Header ⓘ → this station's Displays → Timeline leaf (see LineNotesCard). */
  onOpenStatusHistory?: () => void;
  /**
   * Open this station's Displays → Locations leaf (the footer location pill's
   * **New location**). Omitted on a surface with no Displays column — the menu
   * then has no such row.
   */
  onOpenLocations?: () => void;
  /**
   * Repoint the header ⓘ (dev receive-panel tester). Outranks
   * {@link onOpenStatusHistory} — see the prop's docblock on LineNotesCard.
   */
  headerAction?: { label: string; onClick: () => void; pressed?: boolean };
  onComposerModeChange?: (mode: StationComposerMode) => void;
  /** Ticket draft has a body — drives the carton-context draft number badge. */
  onTicketDraftFilledChange?: (filled: boolean) => void;
  /** Linked ticket is on the row. Switch the station thread onto it. */
  onTicketLinked?: (ticketNumber: string) => void;
  /** "Link existing ticket?" pressed — the station reveals its Ticket tab. */
  onLinkTicketOpen?: () => void;
  onComposerFocus?: () => void;
  /** Procedure fill for the composer bottom-right {@link ScanStationProgressRing}. */
  progressPercent?: number;
  progressTone?: 'idle' | 'selected';
  onProgressClick?: () => void;
  /**
   * The operator typed into the note field. Unbox opens the Label band on this
   * so the sticker face shows the note as it is being written.
   */
  onNoteTyped?: () => void;
}

export function WorkspaceNotesCard({
  row,
  c,
  ticketDraftModel,
  noteGrain = 'line',
  animateMount = true,
  chrome = 'raised',
  reaction,
  trailingAction,
  locationLeading,
  labelPeek,
  onPrimaryAction,
  primaryActionDisabled,
  onOpenStatusHistory,
  onOpenLocations,
  headerAction,
  onComposerModeChange,
  onTicketDraftFilledChange,
  onTicketLinked,
  onLinkTicketOpen,
  onComposerFocus,
  progressPercent,
  progressTone,
  onProgressClick,
  onNoteTyped,
}: WorkspaceNotesCardProps) {
  return (
    <div id="zoho-notes-card">
      <LineNotesCard
        ticketDraftModel={ticketDraftModel}
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
        reaction={reaction}
        trailingAction={trailingAction}
        locationLeading={locationLeading}
        labelPeek={labelPeek}
        onPrimaryAction={onPrimaryAction}
        primaryActionDisabled={primaryActionDisabled}
        onOpenStatusHistory={onOpenStatusHistory}
        onOpenLocations={onOpenLocations}
        headerAction={headerAction}
        onComposerModeChange={onComposerModeChange}
        onTicketDraftFilledChange={onTicketDraftFilledChange}
        onTicketLinked={onTicketLinked}
        onLinkTicketOpen={onLinkTicketOpen}
        trackingNumber={row.tracking_number}
        orderNumber={row.return_source_order_id || row.source_order_id || null}
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
