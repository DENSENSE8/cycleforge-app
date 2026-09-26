'use client';

/** Return sections: the order being returned, and the item coming back. */

import type { SkuCatalogItem } from '@/hooks/useSkuCatalogSearch';
import type { BuildAddInboundImportBodyInput } from '@/lib/inbound/build-add-inbound-payload';
import { orderNumberLabel, usePlatformChoices, usePriorityChoices } from './composer-choices';
import { CatalogItemPicker } from './CatalogItemPicker';
import {
  ComposerField,
  ComposerInput,
  ComposerSection,
  ComposerSelect,
  ComposerTextArea,
} from './receiving-order-composer-parts';

export type ReturnDraft = Omit<BuildAddInboundImportBodyInput, 'receivingType' | 'pickedCatalogId'>;

export function ReturnOrderFields({
  draft,
  onChange,
}: {
  draft: ReturnDraft;
  onChange: (patch: Partial<ReturnDraft>) => void;
}) {
  const platforms = usePlatformChoices();
  const priorities = usePriorityChoices();

  return (
    <ComposerSection label="Order">
      <div className="grid grid-cols-2 gap-3">
        <ComposerField label="Platform" required>
          <ComposerSelect value={draft.platform} onChange={(platform) => onChange({ platform })} options={platforms} />
        </ComposerField>
        <ComposerField label={orderNumberLabel(draft.platform)} required missing={!draft.orderId.trim()}>
          <ComposerInput value={draft.orderId} onChange={(e) => onChange({ orderId: e.target.value })} />
        </ComposerField>
        <ComposerField label="Return tracking number" required missing={!draft.trackingNumber.trim()}>
          <ComposerInput value={draft.trackingNumber} onChange={(e) => onChange({ trackingNumber: e.target.value })} />
        </ComposerField>
        <ComposerField label="RMA">
          <ComposerInput value={draft.rmaId} onChange={(e) => onChange({ rmaId: e.target.value })} />
        </ComposerField>
        <ComposerField label="Priority" className="col-span-2">
          <ComposerSelect value={draft.priority} onChange={(priority) => onChange({ priority })} options={priorities} />
        </ComposerField>
      </div>
    </ComposerSection>
  );
}

export function ReturnItemFields({
  draft,
  picked,
  onPick,
  onChange,
}: {
  draft: ReturnDraft;
  picked: SkuCatalogItem | null;
  onPick: (item: SkuCatalogItem | null) => void;
  onChange: (patch: Partial<ReturnDraft>) => void;
}) {
  return (
    <ComposerSection label="Item">
      <CatalogItemPicker picked={picked} onPick={onPick} />
      <div className="grid grid-cols-[5rem_1fr] gap-3">
        <ComposerField label="Qty">
          <ComposerInput inputMode="numeric" value={draft.quantity} onChange={(e) => onChange({ quantity: e.target.value })} />
        </ComposerField>
        <ComposerField label="Listing URL">
          <ComposerInput
            type="url"
            placeholder="https://"
            value={draft.listingUrl}
            onChange={(e) => onChange({ listingUrl: e.target.value })}
          />
        </ComposerField>
      </div>
      <ComposerField label="Return reason">
        <ComposerTextArea
          value={draft.returnReason}
          className="min-h-16"
          onChange={(e) => onChange({ returnReason: e.target.value })}
        />
      </ComposerField>
    </ComposerSection>
  );
}
