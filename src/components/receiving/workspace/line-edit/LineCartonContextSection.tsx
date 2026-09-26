'use client';

/** Carton-context section of the LineEditPanel — photos + claim + shipment context (listing, PO#, tracking, platform + type + priority… */

import { CartonContextCard } from '@/components/station/entity-context';
import { dispatchReceivingWorkspaceClose } from '@/utils/events';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { isLocalPickupFulfillment } from '@/lib/receiving/fulfillment-mode';
import { getReceivingPoIdentityParts } from '@/lib/receiving/po-group-title';
import { useCartonPoTotal } from './hooks/useCartonPoTotal';
import type { UnboxLineController } from './unbox-line-controller';

interface LineCartonContextSectionProps {
  row: ReceivingLineRow;
  staffId: string;
  c: UnboxLineController;
  /** Carton photo-pill stage (stage SoT) forwarded to {@link CartonContextCard} — required, never defaulted (a defaulted safety… */
  photoStage: 'arrival_package' | 'unbox_carton';
  /**
   * Serial-resolved outbound (return) order#. When the carton has no PO# of its
   * own, this fills the top-row PO#/order chip (last-8) — the lifted linkage
   * identity that replaces the standalone LINKAGE panel.
   */
  linkedOrderNumber?: string | null;
  /**
   * Toggle the Unbox Claim push column (`?claimView=1`). When set, Claim opens
   * and closes the slide-out (same grammar as Ticket History). Falls back to
   * `c.openClaimModal('create')` when omitted (Testing / non-Unbox hosts).
   */
  onToggleClaimView?: () => void;
  /** True while the Claim push column is open. */
  claimViewActive?: boolean;
  /** Draft ticket number badge — replaces the Claim verb while a claim is drafted. */
  draftTicketNumber?: string | null;
  /**
   * Toggle the inline support-ticket editor (`?ticketView=1`). Passed through to
   * the carton card's reply-toggle button (unbox-only opt-in). Omit to hide it.
   */
  onToggleTicketView?: () => void;
  /** True while the inline ticket editor is open. */
  ticketViewActive?: boolean;
  /**
   * When false, never auto-expand (legacy — pills are always on when shown).
   * Kept for call-site API parity.
   */
  expandClassifyWhenPending?: boolean;
  /**
   * When false, hide the header platform/type/urgency pills entirely. Default true.
   */
  showClassifyControls?: boolean;
  /**
   * When false, header pills are read-only facts. Default true = chip-anchored
   * InlinePillPicker menus. Classify Displays / Arrival Classify stay available
   * when staff open those surfaces themselves.
   */
  classifyInteractive?: boolean;
  /** Switch Unbox workspace to the Tracking tab. */
  onEditTracking?: () => void;
  /** Switch Unbox workspace to the Listings tab. */
  onEditListing?: () => void;
  /** Open Package Pairing → PO tab (link / change / import a Zoho PO). */
  onEditPo?: () => void;
  /** Pulse tracking chip while Tracking tab is active. */
  trackingEditOpen?: boolean;
  /** Pulse PO chip while Package Pairing (PO) is open. */
  poEditOpen?: boolean;
  /** Unbox: open Photos → Move in Displays. */
  onOpenMovePhotosExternal?: () => void;
  /** Unbox: open Photos → Send in Displays. */
  onSendToTicketExternal?: () => void;
  /**
   * Unbox: double-click Photos pill → Displays → Photos (Actions).
   * Replaces whatever Displays leaf is open; opens the column when closed.
   */
  onOpenPhotosDisplay?: () => void;
  /** Opt-out: suppress Photos hover toolbar. */
  suppressPhotoHoverGallery?: boolean;
}

// The carton-context card (photos + claim) is identical in unbox and triage —
// both always show the staff photo row and the Claim action — so this section
// needs no mode/variant input.
export function LineCartonContextSection({
  row,
  staffId,
  c,
  linkedOrderNumber = null,
  onToggleClaimView,
  claimViewActive = false,
  draftTicketNumber = null,
  onToggleTicketView,
  ticketViewActive = false,
  expandClassifyWhenPending = true,
  showClassifyControls = true,
  classifyInteractive = true,
  onEditTracking,
  onEditListing,
  onEditPo,
  trackingEditOpen = false,
  poEditOpen = false,
  photoStage,
  onOpenMovePhotosExternal,
  onSendToTicketExternal,
  onOpenPhotosDisplay,
  suppressPhotoHoverGallery = false,
}: LineCartonContextSectionProps) {
  void expandClassifyWhenPending;

  // PO money total — carton grain by construction (a sum over the carton's
  // lines), derived via the SoT (`cartonPoTotal`), never summed in the card.
  const poTotal = useCartonPoTotal(row.receiving_id ?? null);

  /** Order# for the identity chip — from the receiving SoT, NOT `c.poNumber`. */
  const { poValue: cartonOrderNumber } = getReceivingPoIdentityParts(row, () => '');

  return (
    <CartonContextCard
      receivingId={row.receiving_id ?? null}
      staffId={staffId}
      isUnmatched={row.receiving_source === 'unmatched'}
      showClassifyControls={showClassifyControls}
      classifyInteractive={classifyInteractive}
      poTotal={poTotal}
      showPoTotal
      // Qty left this band on 2026-08-02:
      qty={null}
      showStaffPhotoRow
      photoStage={photoStage}
      onMakeClaim={onToggleClaimView ?? (() => c.openClaimModal('create'))}
      claimViewActive={claimViewActive}
      draftTicketNumber={draftTicketNumber}
      listingLink={c.listingLink}
      listingOpenHref={c.listingOpenHref}
      listingLinks={c.listingLinks}
      onEditListing={onEditListing}
      poOpenHref={c.poOpenHref}
      trackingOpenHref={c.trackingOpenHref}
      poDisplay={cartonOrderNumber || c.poNumber}
      onEditPo={onEditPo}
      poEditOpen={poEditOpen}
      linkedOrderNumber={linkedOrderNumber}
      lineId={row.id ?? null}
      zendeskTrimmed={c.zendeskTrimmed}
      zendeskHref={c.zendeskHref}
      zendeskChipDisplay={c.zendeskChipDisplay}
      providerTicketId={c.providerTicketId}
      onTicketUnlinked={() => {
        c.setZendesk('');
        void c.invalidateSupportTicket();
        dispatchLineUpdated({ id: row.id, zendesk_ticket: null });
      }}
      primaryTrackingTrimmed={c.primaryTrackingTrimmed}
      filledExtraTrackingsCount={c.filledExtraTrackingsCount}
      carrierHint={row.carrier}
      isLocalPickup={isLocalPickupFulfillment(row)}
      onEditTracking={onEditTracking}
      trackingEditOpen={trackingEditOpen}
      platformValue={c.sourcePlatform}
      onPlatformSelect={(next) => {
        c.setSourcePlatform(next);
        void c.savePlatform(next, {
          isReturn: c.receivingType.trim().toUpperCase() === 'RETURN',
        });
      }}
      receivingType={c.receivingType}
      onTypeSelect={(next) => {
        // Carton default now — persists to receiving.intake_type. Per-line
        // overrides (receiving_lines.receiving_type) are set in the PO-items row.
        c.setReceivingType(next);
        void c.saveType(next);
      }}
      priorityTier={c.priorityTier}
      onPrioritySelect={(tier) => void c.handlePrioritySelect(tier)}
      onToggleTicketView={onToggleTicketView}
      ticketViewActive={ticketViewActive}
      // Unbox + Arrival share this close. Unbox's pane hook must enter desk
      // (`?unboxdesk=1`) so station-first MRU does not reopen the carton.
      onExitToList={() => dispatchReceivingWorkspaceClose()}
      onSendToTicket={
        onSendToTicketExternal ?? (() => c.setPhotoNoteOpen(true))
      }
      onOpenMovePhotosExternal={onOpenMovePhotosExternal}
      onOpenPhotosDisplay={onOpenPhotosDisplay}
      suppressPhotoHoverGallery={suppressPhotoHoverGallery}
    />
  );
}
