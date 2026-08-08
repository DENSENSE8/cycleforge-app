'use client';

import { CartonContextCard } from '@/components/station/entity-context';
import { useCapabilityProviderLabel } from '@/hooks/useCapabilityProviderLabel';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { dispatchLineUpdated, dispatchSelectLine } from '@/components/station/receiving-lines-table-helpers';
import { isLocalPickupFulfillment } from '@/lib/receiving/fulfillment-mode';
import {
  getReceivingStatusDot,
  getReceivingStatusDotLabel,
  getReceivingStatusDotTip,
  getReceivingStatusPillClass,
} from '@/lib/receiving/rail/status';
import { useCartonPoTotal } from '@/components/receiving/workspace/line-edit/hooks/useCartonPoTotal';
import type { TestingController } from './testing-panel-types';

/**
 * Testing adapter for the station entity-context header SoT
 * (`CartonContextCard` via `@/components/station/entity-context`).
 * Two-row family face (same as Unbox / Triage). Pair host with
 * `placement="flow"` + `reserveIdentityClearance={false}`.
 */
export function TestingCartonHeader({
  c,
  row,
  staffId,
  onEditPo,
  poEditOpen = false,
  onToggleClaimView,
  claimViewActive = false,
  onToggleTicketView,
  ticketViewActive = false,
  onExitToList,
}: {
  c: TestingController;
  row: ReceivingLineRow;
  staffId: string;
  /** `# ----` PO chip → open the Package Pairing (Linkage) display. */
  onEditPo?: () => void;
  poEditOpen?: boolean;
  /** Claim CTA → open Ticket display (create claim). */
  onToggleClaimView?: () => void;
  claimViewActive?: boolean;
  /** Filed ticket chip → toggle Ticket display. */
  onToggleTicketView?: () => void;
  ticketViewActive?: boolean;
  /** Identity ◁ — prefer host browse clear when provided. */
  onExitToList?: () => void;
}) {
  const poTotal = useCartonPoTotal(row.receiving_id ?? null);
  const { label: inventoryProviderLabel } = useCapabilityProviderLabel('inventory');

  return (
    <CartonContextCard
      receivingId={row.receiving_id ?? null}
      staffId={staffId}
      isUnmatched={row.receiving_source === 'unmatched'}
      showStaffPhotoRow
      onMakeClaim={onToggleClaimView ?? (() => c.openClaimModal('create'))}
      claimViewActive={claimViewActive}
      listingLink={c.listingLink}
      listingOpenHref={c.listingOpenHref}
      listingLinks={c.listingLinks}
      poOpenHref={c.poOpenHref}
      trackingOpenHref={c.trackingOpenHref}
      poDisplay={c.poNumber}
      poTotal={poTotal}
      showPoTotal
      onEditPo={onEditPo}
      poEditOpen={poEditOpen}
      lifecycle={{
        dotClass: getReceivingStatusDot(row),
        pillClass: getReceivingStatusPillClass(row),
        label: getReceivingStatusDotLabel(row),
        tip: getReceivingStatusDotTip(row, inventoryProviderLabel),
      }}
      lineId={row.id ?? null}
      zendeskTrimmed={c.zendeskTrimmed}
      zendeskHref={c.zendeskHref}
      zendeskChipDisplay={c.zendeskChipDisplay}
      providerTicketId={c.providerTicketId}
      onTicketUnlinked={() => {
        c.setZendesk('');
        dispatchLineUpdated({ id: row.id, zendesk_ticket: null, notes: row.notes });
      }}
      onToggleTicketView={onToggleTicketView}
      ticketViewActive={ticketViewActive}
      primaryTrackingTrimmed={c.primaryTrackingTrimmed}
      filledExtraTrackingsCount={c.filledExtraTrackingsCount}
      carrierHint={row.carrier}
      isLocalPickup={isLocalPickupFulfillment(row)}
      platformValue={c.sourcePlatform}
      onPlatformSelect={(next) => {
        c.setSourcePlatform(next);
        void c.savePlatform(next, {
          isReturn: c.receivingType.trim().toUpperCase() === 'RETURN',
        });
      }}
      receivingType={c.receivingType}
      onTypeSelect={(next) => {
        c.setReceivingType(next);
        void c.saveType(next);
      }}
      priorityTier={c.priorityTier}
      onPrioritySelect={(tier) => void c.handlePrioritySelect(tier)}
      onExitToList={onExitToList ?? (() => dispatchSelectLine(null))}
      onSendToTicket={() => c.setPhotoNoteOpen(true)}
      // Testing is always downstream of Unbox — a carton reaching this bench
      // has necessarily already been opened, so its carton photos are
      // unbox-stage evidence, never arrival.
      photoStage="unbox_carton"
    />
  );
}
