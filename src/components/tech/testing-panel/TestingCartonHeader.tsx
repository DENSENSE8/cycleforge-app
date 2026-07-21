import { CartonContextCard } from '@/components/station/entity-context';
import {
  dispatchLineUpdated,
  dispatchSelectLine,
  type ReceivingLineRow,
} from '@/components/station/ReceivingLinesTable';
import { isLocalPickupFulfillment } from '@/lib/receiving/fulfillment-mode';
import type { TestingController } from './testing-panel-types';

/**
 * Testing adapter for the station entity-context header SoT
 * (`CartonContextCard` via `@/components/station/entity-context`) —
 * wires the testing-line controller to PO / tracking / listing / platform /
 * type / priority editors + claim CTA.
 */
export function TestingCartonHeader({
  c,
  row,
  staffId,
}: {
  c: TestingController;
  row: ReceivingLineRow;
  staffId: string;
}) {
  return (
    <CartonContextCard
      receivingId={row.receiving_id ?? null}
      staffId={staffId}
      isUnmatched={row.receiving_source === 'unmatched'}
      showStaffPhotoRow
      onMakeClaim={() => c.openClaimModal('create')}
      listingLink={c.listingLink}
      setListingLink={c.setListingLink}
      listingEditorOpen={c.listingEditorOpen}
      setListingEditorOpen={c.setListingEditorOpen}
      listingOpenHref={c.listingOpenHref}
      listingLinks={c.listingLinks}
      poOpenHref={c.poOpenHref}
      trackingOpenHref={c.trackingOpenHref}
      poDisplay={c.poNumber}
      poEditorOpen={c.poEditorOpen}
      setPoEditorOpen={c.setPoEditorOpen}
      poNumberEdit={c.poNumberEdit}
      setPoNumberEdit={c.setPoNumberEdit}
      onCommitPoNumber={(v) => {
        const trimmed = v.trim();
        const current = (row.zoho_purchaseorder_number || row.zoho_purchaseorder_id || '').trim();
        if (trimmed !== current) void c.persistPoNumber(trimmed);
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
        c.setReceivingType(next);
        void c.saveType(next);
      }}
      priorityTier={c.priorityTier}
      onPrioritySelect={(tier) => void c.handlePrioritySelect(tier)}
      onExitToList={() => dispatchSelectLine(null)}
      onSendToTicket={() => c.setPhotoNoteOpen(true)}
      density="bar"
    />
  );
}
