'use client';

/**
 * Zoho PO tab for Package Pairing — two independent paths:
 *   1. Search & add product by inventory SKU (no PO link; carton stays unfound).
 *   2. Link / relink the carton to a purchase order (PoLinkTab) — secondary.
 *
 * Operators use (1) when the PO is still unknown but the product in the box
 * should be recorded on the unfound carton.
 */
import { EcwidProductSearchInline } from '@/components/receiving/unfound/EcwidProductSearchInline';
import type { EcwidProductSelection } from '@/components/receiving/unfound/EcwidProductSearchInline';
import { PoLinkTab } from '@/components/receiving/workspace/line-edit/PoLinkTab';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

export function ZohoPoPairTab({
  row,
  receivingId,
  onAddSku,
  allowOffPo: _allowOffPo = false,
}: {
  row: ReceivingLineRow;
  receivingId: number;
  onAddSku: (selection: EcwidProductSelection) => Promise<void>;
  /** Matched carton → add as an off-PO extra (not on the Zoho PO). */
  allowOffPo?: boolean;
}) {
  return (
    <div className="space-y-4">
      <EcwidProductSearchInline
        receivingId={receivingId}
        popoverMode="search"
        searchFieldOverride="zoho_catalog"
        onSelect={onAddSku}
        // Headerless inline search (no close ✕), so there is nothing to close —
        // `onClose` is only consumed by the header (not rendered here).
        onClose={() => {}}
      />

      <div className="border-t border-border-hairline pt-4">
        <p className="mb-2 text-role-eyebrow uppercase tracking-widest text-text-faint">
          Link purchase order
        </p>
        <PoLinkTab row={row} receivingId={receivingId} />
      </div>
    </div>
  );
}
