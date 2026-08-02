'use client';

/**
 * Carton-context section of the LineEditPanel — photos + claim + shipment
 * context (listing, PO#, tracking, platform + type + priority pills) in one
 * WorkspaceCard. Pure wiring from the controller bag to the station SoT
 * {@link CartonContextCard} (`@/components/station/entity-context`);
 * extracted from LineEditPanel so the panel stays a short composition surface.
 *
 * Listing / tracking Edit navigate to Unbox SectionTabsSlider tabs (parent
 * passes `onEdit*` + `*EditOpen`). PO# Edit opens Package Pairing → PO when
 * the carton has no real Zoho PO id (`onEditPo`).
 */

import { CartonContextCard } from '@/components/station/entity-context';
import { dispatchReceivingWorkspaceClose } from '@/utils/events';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { isLocalPickupFulfillment } from '@/lib/receiving/fulfillment-mode';
import {
  getReceivingStatusDot,
  getReceivingStatusDotLabel,
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
   * When false, header pills are read-only facts (triage — Overview checklist
   * owns edits). Default true = unbox InlinePillPicker.
   */
  classifyInteractive?: boolean;
  /**
   * Unbox / Arrival: fired when a classify pill is clicked — host opens the
   * Classify surface and expands that dimension's names list.
   */
  onClassifyPillOpen?: (picker: 'urgency' | 'platform' | 'type') => void;
  /**
   * Forwarded to {@link CartonContextCard} — `bar` for the sticky station
   * chrome, `bar-stacked` for the two-row Unbox identity (row 1 = urgency ·
   * platform · type → listing; row 2 = order#/PO# · tracking# → ticket/Claim ·
   * Photos). This adapter serves BOTH Unbox and Triage, so the two-row face is
   * opted into per call site — Triage stays on the one-row `bar`.
   */
  density?: 'card' | 'bar' | 'bar-stacked';
  /** Switch Unbox workspace to the Tracking tab. */
  onEditTracking?: () => void;
  /** Switch Unbox workspace to the Listings tab. */
  onEditListing?: () => void;
  /** Open Package Pairing → PO tab (link / import a Zoho PO). */
  onEditPo?: () => void;
  /** Pulse tracking chip while Tracking tab is active. */
  trackingEditOpen?: boolean;
  /** Pulse listing chip while Listings tab is active. */
  listingEditOpen?: boolean;
  /** Pulse PO chip while Package Pairing (PO) is open. */
  poEditOpen?: boolean;
  /** Unbox: open Move photos in the station tool push. */
  onOpenMovePhotosExternal?: () => void;
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
  onClassifyPillOpen,
  density = 'card',
  onEditTracking,
  onEditListing,
  onEditPo,
  trackingEditOpen = false,
  listingEditOpen = false,
  poEditOpen = false,
  photoStage,
  onOpenMovePhotosExternal,
}: LineCartonContextSectionProps) {
  void expandClassifyWhenPending;

  // PO money total — carton grain by construction (a sum over the carton's
  // lines), derived via the SoT (`cartonPoTotal`), never summed in the card.
  const poTotal = useCartonPoTotal(row.receiving_id ?? null);
  const isStackedDensity = density === 'bar-stacked';

  return (
    <CartonContextCard
      receivingId={row.receiving_id ?? null}
      staffId={staffId}
      isUnmatched={row.receiving_source === 'unmatched'}
      showClassifyControls={showClassifyControls}
      classifyInteractive={classifyInteractive}
      onClassifyPillOpen={onClassifyPillOpen}
      density={density}
      poTotal={poTotal}
      showPoTotal={isStackedDensity}
      // ACTIVE LINE, not a carton rollup — this is the same `n/expected` the
      // operator just read on the rail row they clicked, so the two surfaces
      // never show different numbers for the same click.
      //
      // `quantity_received` is typed `number` but a synthetic unfound row
      // arrives without it, which rendered a literal `undefined/?`. Coerce to
      // 0 so an unfound carton reads `0/?` — exactly what its rail row says.
      qty={
        isStackedDensity
          ? {
              received: Number(row.quantity_received) || 0,
              expected: row.quantity_expected ?? null,
            }
          : null
      }
      // Same dot + label the operator just clicked in the sidebar rail — the
      // rail SoT owns the unmatched / Zoho-received special cases, so the band
      // and the rail can never disagree about a carton's stage.
      lifecycle={
        isStackedDensity
          ? {
              dotClass: getReceivingStatusDot(row),
              label: getReceivingStatusDotLabel(row),
            }
          : null
      }
      showStaffPhotoRow
      photoStage={photoStage}
      onMakeClaim={onToggleClaimView ?? (() => c.openClaimModal('create'))}
      claimViewActive={claimViewActive}
      listingLink={c.listingLink}
      listingOpenHref={c.listingOpenHref}
      listingLinks={c.listingLinks}
      onEditListing={onEditListing}
      listingEditOpen={listingEditOpen}
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
      onSendToTicket={() => c.setPhotoNoteOpen(true)}
      onOpenMovePhotosExternal={onOpenMovePhotosExternal}
    />
  );
}
