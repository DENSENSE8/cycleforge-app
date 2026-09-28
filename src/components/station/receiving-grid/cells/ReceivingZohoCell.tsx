'use client';

/** Vendor-receipt state for one inbound row — the `zoho` column's cell. */

import { GridCellDash } from '@/components/ui/grid-cells';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { zohoReceiptFace } from '@/lib/receiving/zoho-receipt-face';
import { formatDateTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';
import {
  receivingDataCellClass,
  receivingDataCellStyle,
  type ReceivingGridCellProps,
} from './receiving-grid-cell-types';

/**
 * The display atom, shared by BOTH inbound grid families (Unbox/History rows
 * take the ctx-shaped cell below; Incoming's row shell renders this directly).
 * One face, two shells — never two faces.
 */
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

/** Unbox / History / Testing family cell. */
export function ReceivingZohoCell({ col, rule, ctx }: ReceivingGridCellProps) {
  return (
    <div data-col="zoho" className={receivingDataCellClass(col, rule, ctx)}
      style={receivingDataCellStyle(col, ctx)}>
      <ZohoReceiptChip
        status={ctx.row.zoho_status}
        syncedAt={ctx.row.zoho_status_synced_at}
      />
    </div>
  );
}
