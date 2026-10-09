'use client';

/** The order record header's trailing nodes, left of In place | Split: its
 * statuses (Buyer cancel, Urgent… — operator 2026-10-08) and, off Allocate,
 * its lifecycle code and print key. Photos live on the record's one Photos
 * door (`OrderEvidencePhotosButton`, P opens it). Record verbs live in the
 * record's Actions panel under Customer · Shipping (operator 2026-10-08).
 * Every order record header paints this — the desks, Search and Unbox's
 * Return order. */

import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { IconButton } from '@/design-system/primitives/IconButton';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Printer } from '@/components/Icons';
import { OrderRecordStatus, OrderRecordStatusTags } from '../OrderRecordView';
import { usePrintPackingSlip } from './print-slip';
import { ORDER_VERB_HOTKEYS } from './order-key-table';
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
  const tags = <OrderRecordStatusTags record={record} records={records} />;
  if (VIEW_SPECS[viewKey].recordPresentation === 'allocate') {
    return (
      <span className="flex min-w-0 items-center gap-1.5" data-testid="order-record-header-actions">
        {tags}
      </span>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5" data-testid="order-record-header-actions">
      <OrderNoteChip record={record} />
      {tags}
      <OrderRecordStatus record={record} records={records} />
      <HoverTooltip label="Print packing slip" shortcut={ORDER_VERB_HOTKEYS['print-slip'].toUpperCase()} asChild placement="above">
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
