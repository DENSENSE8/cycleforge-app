'use client';

import { EcwidProductSearchInline } from '@/components/receiving/unfound/EcwidProductSearchInline';
import type { EcwidProductSelection } from '@/components/receiving/unfound/EcwidProductSearchInline';

/**
 * Zoho Item pairing tab for Package Pairing.
 *
 * This is the "add by inventory SKU" path (no purchase-order link required). On
 * unfound cartons, this is the default leftmost pill and the quickest way to
 * record what's inside the box before the PO is known.
 */
export function ZohoItemPairTab({
  receivingId,
  onAddSku,
  allowOffPo: _allowOffPo = false,
}: {
  receivingId: number;
  onAddSku: (selection: EcwidProductSelection) => Promise<void>;
  /** Matched carton → add as an off-PO extra (not on the Zoho PO). */
  allowOffPo?: boolean;
}) {
  return (
    <EcwidProductSearchInline
      receivingId={receivingId}
      popoverMode="search"
      searchFieldOverride="zoho_catalog"
      chrome="bare"
      onSelect={onAddSku}
      // Headerless inline search (no close ✕), so there is nothing to close —
      // `onClose` is only consumed by the header (not rendered here).
      onClose={() => {}}
    />
  );
}
