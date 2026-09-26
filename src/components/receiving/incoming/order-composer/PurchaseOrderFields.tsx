'use client';

/** Purchase-order sections: the order header and the shipment it rides on. */

import type { PoIntakeDraft, PoIntakeMissingField } from '@/lib/inbound/po-intake-draft';
import { orderNumberLabel, usePlatformChoices, usePriorityChoices } from './composer-choices';
import { ComposerField, ComposerInput, ComposerSection, ComposerSelect } from './receiving-order-composer-parts';

interface PurchaseOrderFieldsProps {
  draft: PoIntakeDraft;
  missing: readonly PoIntakeMissingField[];
  onChange: (patch: Partial<PoIntakeDraft>) => void;
}

export function PurchaseOrderFields({ draft, missing, onChange }: PurchaseOrderFieldsProps) {
  const platforms = usePlatformChoices();
  const priorities = usePriorityChoices();

  return (
    <>
      <ComposerSection label="Order">
        <div className="grid grid-cols-2 gap-3">
          <ComposerField label="Platform" required missing={missing.includes('platform')}>
            <ComposerSelect value={draft.platform} onChange={(platform) => onChange({ platform })} options={platforms} />
          </ComposerField>
          <ComposerField label={orderNumberLabel(draft.platform)} required missing={missing.includes('order_id')}>
            <ComposerInput value={draft.orderId} onChange={(e) => onChange({ orderId: e.target.value })} />
          </ComposerField>
          <ComposerField label="Seller">
            <ComposerInput value={draft.seller} onChange={(e) => onChange({ seller: e.target.value })} />
          </ComposerField>
          <ComposerField label="Buyer account">
            <ComposerInput value={draft.accountName} onChange={(e) => onChange({ accountName: e.target.value })} />
          </ComposerField>
          <ComposerField label="Priority" className="col-span-2">
            <ComposerSelect value={draft.priority} onChange={(priority) => onChange({ priority })} options={priorities} />
          </ComposerField>
        </div>
      </ComposerSection>

      <ComposerSection label="Shipment">
        <div className="grid grid-cols-[1fr_12rem] gap-3">
          <ComposerField label="Tracking number" required missing={missing.includes('tracking_number')}>
            <ComposerInput value={draft.trackingNumber} onChange={(e) => onChange({ trackingNumber: e.target.value })} />
          </ComposerField>
          <ComposerField label="Carrier">
            <ComposerInput
              value={draft.carrierCode}
              placeholder="Detected from tracking"
              onChange={(e) => onChange({ carrierCode: e.target.value })}
            />
          </ComposerField>
        </div>
      </ComposerSection>
    </>
  );
}
