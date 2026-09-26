'use client';

import { DetailSummaryCard } from '@/design-system/components/DetailSummaryCard';
import { plural } from '@/lib/orders/order-hub';
import type { ShipmentRecord } from '@/lib/shipments/shipment-record-types';
import {
  shipmentChip,
  shipmentItemsTitle,
  shipmentPackedLine,
  shipmentShippedLine,
} from './shipment-faces';

/**
 * The package hub's read-only summary on {@link DetailSummaryCard}: what is in
 * the box, packer · packed at, shipped at (+ Backfilled) · items count, the
 * tracking number bottom-left and the carrier status (or the open unmatched
 * scan) bottom-right. The whole card opens `/info`.
 */
export function ShipmentInfoCard({ record, href }: { record: ShipmentRecord; href: string }) {
  const units = record.items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
  return (
    <DetailSummaryCard
      href={href}
      ariaLabel="Package details"
      title={shipmentItemsTitle(record)}
      titleHint={record.items.map((item) => item.title).join('\n') || undefined}
      lines={[
        { text: shipmentPackedLine(record) },
        {
          text: [shipmentShippedLine(record), record.items.length > 0 ? plural(units, 'item') : null]
            .filter(Boolean)
            .join(' · '),
          muted: true,
        },
      ]}
      foot={[record.tracking, record.carrier].filter(Boolean).join(' · ')}
      chip={shipmentChip(record)}
      chipFallback="No carrier scan"
    />
  );
}
