'use client';

import { Suspense } from 'react';
import { DetailFact, DetailFacts, DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { shipmentCarrierStatus } from '@/components/mobile/shipping/shipment/shipment-faces';
import { useShipmentHub } from '@/components/mobile/shipping/shipment/useShipmentHub';
import { DetailRecordFrame } from '@/design-system/components/DetailHubScreen';
import type { ShipmentRecord } from '@/lib/shipments/shipment-record-types';
import { formatDateTimePST } from '@/utils/date';

const words = (raw: string | null | undefined) => (raw ? raw.replace(/_/g, ' ').toLowerCase() : null);
const stamp = (at: string | null | undefined) => (at ? formatDateTimePST(at) : null);

/** `/m/shipping/shipments/[shipmentId]/info` — every fact about the package, read-only (the same facts as the Shipped desk record's aside). */
function ShipmentInfoInner() {
  const hub = useShipmentHub();
  return (
    <DetailRecordFrame<ShipmentRecord>
      record={hub.data}
      state={{ loading: hub.loading, error: hub.error, onRetry: hub.reload }}
      bar={{
        title: hub.data?.tracking ?? hub.param,
        mono: true,
        subtitle: 'Package details',
        backHref: hub.link(hub.base),
      }}
    >
      {(d) => {
        const m = d.carrierMilestones;
        const orderRefs = [...new Set(d.items.map((item) => item.orderRef).filter(Boolean))];
        return (
          <div className="flex-1 divide-y divide-mode-rule">
            <DetailFacts>
              <DetailFact label="Tracking" value={d.tracking} mono copy={d.tracking} />
              <DetailFact label="Carrier" value={d.carrier ?? null} />
              <DetailFact
                label="Status"
                value={shipmentCarrierStatus(d) ?? 'No carrier scan yet'}
                hint={
                  [d.status.description !== shipmentCarrierStatus(d) ? d.status.description : null,
                    d.status.latestEventAt ? `as of ${stamp(d.status.latestEventAt)}` : null]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
              />
              <DetailFact label="Packer" value={d.pack ? d.pack.packerName ?? 'Unknown' : 'Never pack-scanned'} />
              <DetailFact label="Packed" value={d.pack ? stamp(d.pack.packedAt) : null} />
              <DetailFact
                label="Shipped"
                value={d.shipOut ? stamp(d.shipOut.at) : 'Not scanned out'}
                hint={
                  d.shipOut
                    ? [d.shipOut.staffName ? `by ${d.shipOut.staffName}` : null, d.shipOut.backfilled ? 'Backfilled' : null]
                        .filter(Boolean)
                        .join(' · ') || undefined
                    : undefined
                }
              />
            </DetailFacts>
            <DetailSectionHeading>Carrier milestones</DetailSectionHeading>
            <DetailFacts label="Carrier milestones">
              <DetailFact label="Label created" value={stamp(m.labelCreatedAt)} />
              <DetailFact label="Accepted" value={stamp(m.acceptedAt)} />
              <DetailFact label="In transit" value={stamp(m.inTransitAt)} />
              <DetailFact label="Out for delivery" value={stamp(m.outForDeliveryAt)} />
              <DetailFact label="Delivered" value={stamp(m.deliveredAt)} />
              {m.exceptionAt ? <DetailFact label="Carrier exception" value={stamp(m.exceptionAt)} /> : null}
            </DetailFacts>
            <DetailSectionHeading>Links</DetailSectionHeading>
            <DetailFacts label="Links">
              <DetailFact
                label="Box"
                value={d.box ? `${d.box.seq ?? '?'} of ${d.box.total}` : null}
                hint={d.box?.isPrimary ? 'Primary box' : undefined}
              />
              <DetailFact
                label={orderRefs.length === 1 ? 'Order' : 'Orders'}
                value={orderRefs.length > 0 ? orderRefs.join(', ') : 'No order'}
                mono={orderRefs.length > 0}
                copy={orderRefs.length === 1 ? orderRefs[0] : null}
              />
              <DetailFact
                label="Exception"
                value={d.exception ? `${words(d.exception.status)} · ${words(d.exception.reason) ?? 'unmatched scan'}` : 'None'}
                hint={
                  d.exception
                    ? [
                        d.exception.staffName ? `by ${d.exception.staffName}` : null,
                        d.exception.sourceStation,
                        d.exception.createdAt ? stamp(d.exception.createdAt) : null,
                        d.exception.notes,
                      ]
                        .filter(Boolean)
                        .join(' · ') || undefined
                    : undefined
                }
              />
              <DetailFact
                label="Carrier sync"
                value={
                  String(d.carrier ?? '').trim().toUpperCase() === 'USPS'
                    ? 'Integration pending'
                    : d.sync.lastErrorCode || d.sync.lastErrorMessage
                      ? 'Failing'
                      : d.sync.lastCheckedAt
                        ? 'OK'
                        : 'Never checked'
                }
                hint={
                  String(d.carrier ?? '').trim().toUpperCase() === 'USPS'
                    ? 'Live carrier updates are not connected yet'
                    : [d.sync.lastErrorMessage ?? d.sync.lastErrorCode, d.sync.lastCheckedAt ? `checked ${stamp(d.sync.lastCheckedAt)}` : null]
                        .filter(Boolean)
                        .join(' · ') || undefined
                }
              />
            </DetailFacts>
          </div>
        );
      }}
    </DetailRecordFrame>
  );
}

export default function ShipmentInfoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <ShipmentInfoInner />
    </Suspense>
  );
}
