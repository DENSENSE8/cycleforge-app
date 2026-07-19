'use client';

/**
 * Carton-context section of the LineEditPanel — photos + claim + shipment
 * context (listing, PO#, tracking, platform + type + priority pills) in one
 * WorkspaceCard. Pure wiring from the controller bag to the station SoT
 * {@link CartonContextCard} (`@/components/station/entity-context`);
 * extracted from LineEditPanel so the panel stays a short composition surface.
 */

import { CartonContextCard } from '@/components/station/entity-context';
import { dispatchReceivingWorkspaceClose } from '@/utils/events';
import type { ReceivingLineRow } from '@/components/station/ReceivingLinesTable';
import { isLocalPickupFulfillment } from '@/lib/receiving/fulfillment-mode';
import { classifyLineSource } from '@/lib/receiving/intake-items-routing';
import { isIntakeClassified } from '@/lib/receiving/triage-intake-kind';
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
   * When false, never auto-expand platform/type/priority pills in the header
   * (triage moves classify into the Overview SectionTabsSlider tab).
   * Default true = unbox behavior (expand when classify is pending).
   */
  expandClassifyWhenPending?: boolean;
  /**
   * When false, hide the header classify toggle + platform/type/urgency pills
   * entirely (triage). Default true.
   */
  showClassifyControls?: boolean;
  /** Forwarded to {@link CartonContextCard} — `bar` for the sticky station chrome. */
  density?: 'card' | 'bar';
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
  density = 'card',
}: LineCartonContextSectionProps) {
  // An unfound carton whose intake kind isn't set yet: the unbox stepper's
  // Classify dot is active, so surface the classify pills (platform + type)
  // right here in the header — expanded — instead of hiding them behind the
  // sliders toggle. Matched cartons (identity resolved by their PO) and
  // already-classified unfound cartons keep the condensed one-row default.
  // Triage opts out (classify lives in the Overview tab).
  const classifyPending =
    expandClassifyWhenPending &&
    classifyLineSource(row) === 'unmatched' &&
    !isIntakeClassified(row);

  return (
    <CartonContextCard
      receivingId={row.receiving_id ?? null}
      staffId={staffId}
      isUnmatched={row.receiving_source === 'unmatched'}
      classifyPending={classifyPending}
      showClassifyControls={showClassifyControls}
      density={density}
      showStaffPhotoRow
      onMakeClaim={() => c.setClaimModalOpen(true)}
      listingLink={c.listingLink}
      setListingLink={c.setListingLink}
      listingEditorOpen={c.listingEditorOpen}
      setListingEditorOpen={c.setListingEditorOpen}
      listingOpenHref={c.listingOpenHref}
      listingLinks={c.listingLinks}
      poOpenHref={c.poOpenHref}
      trackingOpenHref={c.trackingOpenHref}
      poDisplay={c.poNumber}
      linkedOrderNumber={linkedOrderNumber}
      poEditorOpen={c.poEditorOpen}
      setPoEditorOpen={c.setPoEditorOpen}
      poNumberEdit={c.poNumberEdit}
      setPoNumberEdit={c.setPoNumberEdit}
      // Try a sales-order import first (an order# → classify the carton as a
      // return), falling back to a plain PO# persist. The changed-check + both
      // paths live in the controller method.
      onCommitPoNumber={(v) => void c.commitPoNumberOrImportOrder(v)}
      lineId={row.id ?? null}
      zendeskTrimmed={c.zendeskTrimmed}
      zendeskHref={c.zendeskHref}
      zendeskChipDisplay={c.zendeskChipDisplay}
      providerTicketId={c.providerTicketId}
      onTicketUnlinked={() => {
        void c.invalidateSupportTicket();
      }}
      primaryTrackingTrimmed={c.primaryTrackingTrimmed}
      filledExtraTrackingsCount={c.filledExtraTrackingsCount}
      isLocalPickup={isLocalPickupFulfillment(row)}
      trackingEditorsOpen={c.trackingEditorsOpen}
      onToggleTrackingEditors={c.toggleTrackingEditors}
      trackingEdit={c.trackingEdit}
      setTrackingEdit={c.setTrackingEdit}
      onCommitTracking={(v) => {
        const trimmed = v.trim();
        if (trimmed !== (row.tracking_number || '').trim()) {
          c.patch({ zoho_reference_number: trimmed || null });
        }
      }}
      extraTrackings={c.extraTrackings}
      setExtraTrackings={c.setExtraTrackings}
      onCommitExtraTracking={(v, i) => void c.attachExtraBox(v, i)}
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
    />
  );
}
