'use client';

/**
 * Carton-context section of the LineEditPanel — photos + claim + shipment
 * context (listing, PO#, tracking, platform + type + priority pills) in one
 * WorkspaceCard. Pure wiring from the controller bag to the station SoT
 * {@link CartonContextCard} (`@/components/station/entity-context`);
 * extracted from LineEditPanel so the panel stays a short composition surface.
 *
 * Listing / tracking Edit navigate to Unbox SectionTabsSlider tabs (parent
 * passes `onEdit*` + `*EditOpen`). PO# is copy/open-only.
 */

import { CartonContextCard } from '@/components/station/entity-context';
import { dispatchReceivingWorkspaceClose } from '@/utils/events';
import {
  dispatchLineUpdated,
  type ReceivingLineRow,
} from '@/components/station/ReceivingLinesTable';
import { isLocalPickupFulfillment } from '@/lib/receiving/fulfillment-mode';
import type { UnboxLineController } from './unbox-line-controller';

interface LineCartonContextSectionProps {
  row: ReceivingLineRow;
  staffId: string;
  c: UnboxLineController;
  /**
   * Serial-resolved outbound (return) order#. When the carton has no PO# of its
   * own, this fills the top-row PO#/order chip (last-4) — the lifted linkage
   * identity that replaces the standalone LINKAGE panel.
   */
  linkedOrderNumber?: string | null;
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
   * When false, header pills are read-only facts (triage — Overview checklist
   * owns edits). Default true = unbox InlinePillPicker.
   */
  classifyInteractive?: boolean;
  /**
   * Unbox / Arrival: fired when a classify pill is clicked — host opens the
   * Classify surface and expands that dimension's names list.
   */
  onClassifyPillOpen?: (picker: 'urgency' | 'platform' | 'type') => void;
  /** Forwarded to {@link CartonContextCard} — `bar` for the sticky station chrome. */
  density?: 'card' | 'bar';
  /** Switch Unbox workspace to the Tracking tab. */
  onEditTracking?: () => void;
  /** Switch Unbox workspace to the Listings tab. */
  onEditListing?: () => void;
  /** Pulse tracking chip while Tracking tab is active. */
  trackingEditOpen?: boolean;
  /** Pulse listing chip while Listings tab is active. */
  listingEditOpen?: boolean;
}

// The carton-context card (photos + claim) is identical in unbox and triage —
// both always show the staff photo row and the Claim action — so this section
// needs no mode/variant input.
export function LineCartonContextSection({
  row,
  staffId,
  c,
  linkedOrderNumber = null,
  onToggleTicketView,
  ticketViewActive = false,
  expandClassifyWhenPending = true,
  showClassifyControls = true,
  classifyInteractive = true,
  onClassifyPillOpen,
  density = 'card',
  onEditTracking,
  onEditListing,
  trackingEditOpen = false,
  listingEditOpen = false,
}: LineCartonContextSectionProps) {
  void expandClassifyWhenPending;

  return (
    <CartonContextCard
      receivingId={row.receiving_id ?? null}
      staffId={staffId}
      isUnmatched={row.receiving_source === 'unmatched'}
      showClassifyControls={showClassifyControls}
      classifyInteractive={classifyInteractive}
      onClassifyPillOpen={onClassifyPillOpen}
      density={density}
      showStaffPhotoRow
      onMakeClaim={() => c.openClaimModal('create')}
      listingLink={c.listingLink}
      listingOpenHref={c.listingOpenHref}
      listingLinks={c.listingLinks}
      onEditListing={onEditListing}
      listingEditOpen={listingEditOpen}
      poOpenHref={c.poOpenHref}
      trackingOpenHref={c.trackingOpenHref}
      poDisplay={c.poNumber}
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
      isLocalPickup={isLocalPickupFulfillment(row)}
      onEditTracking={onEditTracking}
      trackingEditOpen={trackingEditOpen}
      platformValue={c.sourcePlatform}
      onPlatformSelect={(next) => {
        c.setSourcePlatform(next);
        void c.savePlatform(next);
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
      // Close the focused line → the right pane crossfades back to the browse
      // feed. Unbox + triage share the same window-event close mechanism.
      onExitToList={() => dispatchReceivingWorkspaceClose()}
      onSendToTicket={() => c.setPhotoNoteOpen(true)}
    />
  );
}
