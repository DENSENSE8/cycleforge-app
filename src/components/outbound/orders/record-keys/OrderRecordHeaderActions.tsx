'use client';

/** The order record header's trailing actions — the Note chip (when the order carries one), the ONE status, then Print packing slip. */

import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { IconButton } from '@/design-system/primitives/IconButton';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Printer } from '@/components/Icons';
import { OrderRecordStatus } from '../OrderRecordView';
import { PRINT_SLIP_HOTKEY, usePrintPackingSlip } from './print-slip';
import { OrderNoteChip } from '../notes/OrderNoteChip';

export function OrderRecordHeaderActions({ record, records }: { record: ShippedOrder; records: readonly ShippedOrder[] }) {
  const slip = usePrintPackingSlip(Number(record.id));
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
