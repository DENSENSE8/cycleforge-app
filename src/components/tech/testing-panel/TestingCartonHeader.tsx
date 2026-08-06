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
} from '@/lib/receiving/rail/status';
import { useCartonPoTotal } from '@/components/receiving/workspace/line-edit/hooks/useCartonPoTotal';
import type { TestingController } from './testing-panel-types';

/**
 * Testing adapter for the station entity-context header SoT
 * (`CartonContextCard` via `@/components/station/entity-context`).
 * Two-row family face (same as Unbox / Triage). Identity chips are
 * display/open/copy; listing/tracking Edit tabs are Unbox-only for now
 * (omit onEdit* here). Pair host with `reserveIdentityClearance="stacked"`.
 */
export function TestingCartonHeader({
  c,
  row,
  staffId,
  onEditPo,
  poEditOpen = false,
}: {
  c: TestingController;
  row: ReceivingLineRow;
  staffId: string;
  /** `# ----` PO chip → open the Package Pairing (Linkage) display. */
  onEditPo?: () => void;
  poEditOpen?: boolean;
}) {
  const poTotal = useCartonPoTotal(row.receiving_id ?? null);
  const { label: inventoryProviderLabel } = useCapabilityProviderLabel('inventory');

  return (
    <CartonContextCard
      receivingId={row.receiving_id ?? null}
      staffId={staffId}
      isUnmatched={row.receiving_source === 'unmatched'}
      showStaffPhotoRow
      onMakeClaim={() => c.openClaimModal('create')}
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
      primaryTrackingTrimmed={c.primaryTrackingTrimmed}
      filledExtraTrackingsCount={c.filledExtraTrackingsCount}
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
      onExitToList={() => dispatchSelectLine(null)}
      onSendToTicket={() => c.setPhotoNoteOpen(true)}
      // Testing is always downstream of Unbox — a carton reaching this bench
      // has necessarily already been opened, so its carton photos are
      // unbox-stage evidence, never arrival.
      photoStage="unbox_carton"
    />
  );
}
