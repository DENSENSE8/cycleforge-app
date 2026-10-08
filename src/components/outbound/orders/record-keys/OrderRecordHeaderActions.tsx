'use client';

/** The order record header's trailing actions. Allocate paints none — its
 * verbs live in the record's Actions panel under Customer · Shipping
 * (operator 2026-10-08); archival records retain their status and print
 * affordance. */

import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { IconButton } from '@/design-system/primitives/IconButton';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Printer } from '@/components/Icons';
import { OrderRecordStatus } from '../OrderRecordView';
import { PRINT_SLIP_HOTKEY, usePrintPackingSlip } from './print-slip';
import { OrderNoteChip } from '../notes/OrderNoteChip';
import { VIEW_SPECS, type OrderViewKey } from '@/lib/views/view-specs';

export function OrderRecordHeaderActions({
  record,
  records,
  viewKey,
}: {
  record: ShippedOrder;
  records: readonly ShippedOrder[];
  viewKey: OrderViewKey;
}) {
  const slip = usePrintPackingSlip(Number(record.id));
  if (VIEW_SPECS[viewKey].recordPresentation === 'allocate') return null;
  return (
    <span className="flex min-w-0 items-center gap-1.5" data-testid="order-record-header-actions">
      <OrderNoteChip record={record} />
      <OrderRecordStatus record={record} records={records} />
      <HoverTooltip label="Print packing slip" shortcut={PRINT_SLIP_HOTKEY.toUpperCase()} asChild placement="above">
        <IconButton
          icon={<Printer className="h-4 w-4" />}
          ariaLabel="Print packing slip"
          size="sm"
          radius="control"
          disabled={slip.pending}
          aria-busy={slip.pending || undefined}
          onClick={slip.print}
          data-testid="order-record-print-slip"
        />
      </HoverTooltip>
    </span>
  );
}
