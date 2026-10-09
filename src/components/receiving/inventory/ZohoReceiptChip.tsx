'use client';

/** Vendor-receipt state chip for one inbound PO / line (Inventory dossier). */

import { GridCellDash } from '@/components/ui/grid-cells';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { zohoReceiptFace } from '@/lib/receiving/zoho-receipt-face';
import { formatDateTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';

/** One receipt face for the Inventory dossier's PO header and line rows. */
export function ZohoReceiptChip({
  status,
  syncedAt,
}: {
  status: string | null | undefined;
  /** `zoho_po_mirror.last_synced_at` — when WE polled, never a transition time. */
  syncedAt?: string | null;
}) {
  const face = zohoReceiptFace(status);
  if (!face) return <GridCellDash />;

  const tip = syncedAt
    ? `${face.tip} Synced ${formatDateTimePST(syncedAt)} — this is a cached answer, not a live one.`
    : face.tip;

  return (
    <HoverTooltip label={tip} focusable={false}>
      <span className="min-w-0">
        <span
          className={cn(
            'inset-chip rounded text-role-micro ring-1 ring-inset',
            face.className,
          )}
        >
          {face.label}
        </span>
      </span>
    </HoverTooltip>
  );
}

