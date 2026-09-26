'use client';

import { Suspense, useState } from 'react';
import { AlertTriangle, Copy, ExternalLink } from '@/components/Icons';
import { ShipmentInfoCard } from '@/components/mobile/shipping/shipment/ShipmentInfoCard';
import { ShipmentResolveSheet } from '@/components/mobile/shipping/shipment/ShipmentResolveSheet';
import { openShipmentException } from '@/components/mobile/shipping/shipment/shipment-faces';
import { shipmentDoors } from '@/components/mobile/shipping/shipment/shipment-doors';
import { SHIPMENT_HUB_PARENT, useShipmentHub } from '@/components/mobile/shipping/shipment/useShipmentHub';
import { DetailDock } from '@/design-system/components/DetailDock';
import { DetailHubScreen } from '@/design-system/components/DetailHubScreen';
import type { ShipmentRecord } from '@/lib/shipments/shipment-record-types';
import { toast } from '@/lib/toast';

type PackageVerb = 'resolve' | 'copy' | 'track';

/** `/m/shipping/shipments/[shipmentId]` — the PACKAGE hub on {@link DetailHubScreen}: */
function ShipmentHubInner() {
  const hub = useShipmentHub();
  const [resolveOpen, setResolveOpen] = useState(false);

  const copy = (tracking: string) => {
    navigator.clipboard?.writeText(tracking).then(
      () => toast.success(`Copied ${tracking}`),
      () => toast.error('Copy failed'),
    );
  };

  return (
    <DetailHubScreen<ShipmentRecord>
      record={hub.data}
      state={{ loading: hub.loading, error: hub.error, onRetry: hub.reload }}
      bar={{
        title: hub.data?.tracking ?? hub.param,
        mono: true,
        subtitle: 'Package',
        backHref: hub.back ?? SHIPMENT_HUB_PARENT,
        close: hub.back != null,
        meta: (d) => d.carrier ?? undefined,
      }}
      card={(d) => <ShipmentInfoCard record={d} href={hub.link(`${hub.base}/info`)} />}
      rowsLabel="Package screens"
      rows={(d) => shipmentDoors(d, hub.base, hub.link)}
      dock={(d) => {
        const exception = openShipmentException(d);
        return (
          <DetailDock<PackageVerb>
            label="Package actions"
            verbs={[
              ...(exception
                ? [{ id: 'resolve' as const, label: 'Resolve exception', icon: <AlertTriangle />, primary: true }]
                : []),
              { id: 'copy', label: 'Copy tracking', icon: <Copy />, primary: !exception },
              { id: 'track', label: 'Carrier', icon: <ExternalLink />, disabled: !d.trackingUrl },
            ]}
            onVerb={(verb) => {
              if (verb === 'resolve') setResolveOpen(true);
              else if (verb === 'copy') copy(d.tracking);
              else if (d.trackingUrl) window.open(d.trackingUrl, '_blank', 'noopener,noreferrer');
            }}
          />
        );
      }}
    >
      {(d) => {
        const exception = openShipmentException(d);
        return exception ? (
          <ShipmentResolveSheet
            open={resolveOpen}
            onClose={() => setResolveOpen(false)}
            record={d}
            exception={exception}
          />
        ) : null;
      }}
    </DetailHubScreen>
  );
}

export default function ShipmentHubPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <ShipmentHubInner />
    </Suspense>
  );
}
