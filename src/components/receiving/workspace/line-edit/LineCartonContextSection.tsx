'use client';

/**
 * Carton-context section of the LineEditPanel — photos + claim + shipment
 * context (listing, PO#, tracking, platform + type + priority pills) in one
 * WorkspaceCard. Pure wiring from the controller bag to the station SoT
 * {@link CartonContextCard} (`@/components/station/entity-context`);
 * extracted from LineEditPanel so the panel stays a short composition surface.
 *
 * Listing / tracking Edit navigate to Unbox SectionTabsSlider tabs (parent
 * passes `onEdit*` + `*EditOpen`). PO# Edit always opens Package Pairing → PO
 * (`onEditPo`).
 *
 * Serves Unbox and Triage — both use the one-row family face. Pair the host
 * with `reserveIdentityClearance={false}` (in-flow) or legacy overlay clearance.
 *
 * Displays `←|` + carton `↑↓` live on ScanStationUtilityRail, not here.
 */

import { CartonContextCard } from '@/components/station/entity-context';
import { useCapabilityProviderLabel } from '@/hooks/useCapabilityProviderLabel';
import { dispatchReceivingWorkspaceClose } from '@/utils/events';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { isLocalPickupFulfillment } from '@/lib/receiving/fulfillment-mode';
import {
  getReceivingStatusDot,
  getReceivingStatusDotLabel,
  getReceivingStatusDotTip,
  getReceivingStatusPillClass,
} from '@/lib/receiving/rail/status';
import { useCartonPoTotal } from './hooks/useCartonPoTotal';
import type { UnboxLineController } from './unbox-line-controller';

interface LineCartonContextSectionProps {
  row: ReceivingLineRow;
  staffId: string;
  c: UnboxLineController;
  /**
   * Carton photo-pill stage (stage SoT) forwarded to {@link CartonContextCard}
   * — required, never defaulted (a defaulted safety classification is how
   * bench photos silently became arrival evidence; see
   * `.claude/rules/backend-patterns.md`). The card renders identically in
   * unbox and triage — both show the staff photo row and Claim — but the
   * capture STAGE differs: triage passes `arrival_package` explicitly, unbox
   * passes `unbox_carton`.
   */
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
  /**
   * Opt-out: suppress Photos hover toolbar. Unbox keeps the strip — Move /
   * Send open Displays via the external callbacks. Pill click stays
   * send-to-phone; double-click opens Displays when {@link onOpenPhotosDisplay}
   * is set.
   */
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
  const { label: inventoryProviderLabel } = useCapabilityProviderLabel('inventory');

  return (
    <CartonContextCard
      receivingId={row.receiving_id ?? null}
      staffId={staffId}
      isUnmatched={row.receiving_source === 'unmatched'}
      showClassifyControls={showClassifyControls}
      classifyInteractive={classifyInteractive}
      poTotal={poTotal}
      showPoTotal
      // Qty left this band on 2026-08-02: Unbox pins it on the Items eyebrow
      // Qty roll-up lives on the PO line accordion (`POUnboxingSection`) as the
      // carton's received/expected facts — not a separate items pin on main.
      // Keeping it here doubled the same fraction in two places with two grains
      // (active-line vs carton), which is how they drifted.
      qty={null}
      // Same coarse stage the operator just clicked in the sidebar rail — the
      // rail SoT owns the unmatched / Zoho-received special cases, so the band
      // and the rail can never disagree about a carton's stage. Tip adds the
      // inventory-sync sentence when coarse status is Unboxed.
      lifecycle={{
        dotClass: getReceivingStatusDot(row),
        pillClass: getReceivingStatusPillClass(row),
        label: getReceivingStatusDotLabel(row),
        tip: getReceivingStatusDotTip(row, inventoryProviderLabel),
      }}
      showStaffPhotoRow
      photoStage={photoStage}
      onMakeClaim={onToggleClaimView ?? (() => c.openClaimModal('create'))}
      claimViewActive={claimViewActive}
      listingLink={c.listingLink}
      listingOpenHref={c.listingOpenHref}
      listingLinks={c.listingLinks}
      onEditListing={onEditListing}
      poOpenHref={c.poOpenHref}
      trackingOpenHref={c.trackingOpenHref}
      poDisplay={c.poNumber}
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
      // Close the focused line → the right pane crossfades back to the browse
      // feed. Unbox + triage share the same window-event close mechanism.
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
