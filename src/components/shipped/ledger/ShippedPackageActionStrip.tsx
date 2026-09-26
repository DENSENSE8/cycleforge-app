'use client';

/** The open package's verbs — the strip under the Shipped ledger's toolbar, in both views. */

import { useMemo, useState } from 'react';
import { Copy, ExternalLink, PackageCheck } from '@/components/Icons';
import { ShippedOrderActionStrip } from '@/components/outbound/orders/shipped-order-line';
import {
  RecordActionStrip,
  type RecordActionVerb,
} from '@/design-system/components/record-action-strip/RecordActionStrip';
import type { ShipmentRecord } from '@/lib/shipments/shipment-record-types';
import { toast } from '@/lib/toast';
import { ResolveShipmentExceptionDialog } from './ResolveShipmentExceptionDialog';
import { isOpenExceptionStatus } from './shipped-package-state';

const ICON_CLASS = 'h-3.5 w-3.5';

export function ShippedPackageActionStrip({
  record,
  orderLineId,
  label,
}: {
  /** The open package's record; null while it loads (order verbs may already paint). */
  record: ShipmentRecord | null;
  /** The package's primary order line (`orders.id`), or null when no order owns the box. */
  orderLineId: number | null;
  label: string;
}) {
  const [resolveOpen, setResolveOpen] = useState(false);
  const exceptionOpen = record?.exception != null && isOpenExceptionStatus(record.exception.status);

  const verbs = useMemo<RecordActionVerb[]>(() => {
    if (!record) return [];
    const list: RecordActionVerb[] = [];
    if (exceptionOpen) {
      list.push({
        id: 'resolve-exception',
        label: 'Resolve exception',
        icon: <PackageCheck className={ICON_CLASS} />,
        hotkey: 'r',
        run: () => setResolveOpen(true),
      });
    }
    list.push({
      id: 'copy-tracking',
      label: 'Copy tracking',
      icon: <Copy className={ICON_CLASS} />,
      run: () =>
        void navigator.clipboard?.writeText(record.tracking).then(
          () => toast.success(`Copied ${record.tracking}`),
          () => toast.error('Copy failed'),
        ),
    });
    if (record.trackingUrl) {
      const url = record.trackingUrl;
      list.push({
        id: 'track',
        label: `Track on ${record.carrier || 'carrier'}`,
        icon: <ExternalLink className={ICON_CLASS} />,
        placement: 'overflow',
        run: () => void window.open(url, '_blank', 'noopener,noreferrer'),
      });
    }
    return list;
  }, [exceptionOpen, record]);

  return (
    <>
      {verbs.length > 0 ? <RecordActionStrip verbs={verbs} label={label} testId="shipped-record-strip" /> : null}
      <ShippedOrderActionStrip lineId={orderLineId} />
      {record && exceptionOpen ? (
        <ResolveShipmentExceptionDialog open={resolveOpen} onOpenChange={setResolveOpen} record={record} />
      ) : null}
    </>
  );
}
