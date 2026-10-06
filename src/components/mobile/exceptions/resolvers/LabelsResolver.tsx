'use client';

/**
 * Labels — the order's latest label ingestion is QUARANTINED or FAILED. Two
 * ways out: reprocess the label (`retry` — a fixed parser, a now-present
 * order, a transient storage fault), or pair the ShipStation label to this
 * order by hand (`link-to-order`, the same link the desk's Link label runs).
 */

import { useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ClipboardList, Link2, RefreshCw } from '@/components/Icons';
import { DetailFact, DetailFacts, DetailNavRow } from '@/components/mobile/detail/DetailParts';
import { DetailDock, type DetailDockVerb } from '@/design-system/components/DetailDock';
import { useAuth } from '@/contexts/AuthContext';
import { useResolveLabelsException } from '@/hooks/exceptions';
import type { LabelsExceptionFacts } from '@/lib/exceptions/facts';
import { ledgerStatus, quarantineCopy } from '@/lib/label-ingestions/ledger-view';
import { withJobReturn } from '@/lib/mobile/nav-trail';
import { toast } from '@/lib/toast';
import { formatMonthDayTimePST } from '@/utils/date';
import type { PhoneResolverProps } from './resolver-props';
import { ShipStationLabelSheet, type ShipStationLabelLink } from './ShipStationLabelSheet';

type LabelsVerb = 'retry' | 'link';

export function LabelsResolver({ facts, onResolved }: PhoneResolverProps<LabelsExceptionFacts>) {
  const { has } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const resolve = useResolveLabelsException();
  const [linkOpen, setLinkOpen] = useState(false);
  const { order, ingestion } = facts;
  const orderRef = order.orderNumber || `#${order.id}`;
  const here = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ''}`;
  const tracking = ingestion.trackingNumberRaw ?? ingestion.trackingNumberNormalized;

  const canRetry = has('packing.complete_order');
  const canLink = has('shipping.buy_label');
  const pendingAction = resolve.isPending ? resolve.variables?.action : null;
  // A FAILED ingestion is a processing fault — reprocess first; a quarantined
  // label was read fine but could not be placed — pair it by hand.
  const retryFirst = ingestion.state === 'FAILED';

  const verbs: DetailDockVerb<LabelsVerb>[] = [
    {
      id: 'retry',
      label: 'Retry',
      icon: <RefreshCw />,
      primary: retryFirst,
      disabled: !canRetry || resolve.isPending,
      loading: pendingAction === 'retry',
    },
    {
      id: 'link',
      label: 'Link to order',
      icon: <Link2 />,
      primary: !retryFirst,
      disabled: !canLink || resolve.isPending,
    },
  ];

  const onVerb = (verb: LabelsVerb) =>
    verb === 'link'
      ? setLinkOpen(true)
      : resolve
          .mutateAsync({ action: 'retry', ingestionId: ingestion.id })
          .then(() => onResolved(`Label ${ingestion.fileBasename} reprocessed.`))
          .catch((error: Error) => toast.error(error.message || 'Could not reprocess the label.'));

  const linkToOrder = (link: ShipStationLabelLink) =>
    resolve
      .mutateAsync({ action: 'link-to-order', orderId: order.id, ...link })
      .then(() => onResolved(`Label linked to ${orderRef}.`))
      .catch((error: Error) => toast.error(error.message || 'Could not link the label.'));

  const blocked = [
    canRetry ? null : 'retrying needs packing access',
    canLink ? null : 'linking a label needs label-buying access',
  ].filter(Boolean);

  return (
    <>
      <DetailFacts label="Label ingestion">
        <DetailFact
          label="Status"
          value={ledgerStatus(ingestion.state).label}
          hint={quarantineCopy(ingestion.quarantineReasonCode, Boolean(ingestion.trackingNumberNormalized))}
        />
        <DetailFact
          label="File"
          value={ingestion.fileBasename}
          mono
          copy={ingestion.fileBasename}
          hint={`${ingestion.source.replace(/_/g, ' ').toLowerCase()} · ${formatMonthDayTimePST(ingestion.observedAt)}`}
        />
        <DetailFact label="Tracking" value={tracking} mono copy={tracking} hint={ingestion.carrier} />
        <DetailFact
          label="Attempted match"
          value={ingestion.marketplaceOrderId}
          mono
          copy={ingestion.marketplaceOrderId}
          hint={[ingestion.accountSource, ingestion.matchMethod?.replace(/_/g, ' ').toLowerCase()].filter(Boolean).join(' · ') || null}
        />
        {ingestion.shipstationShipmentId != null ? (
          <DetailFact
            label="ShipStation"
            value={ingestion.shipstationLabelId ?? `shipment ${ingestion.shipstationShipmentId}`}
            mono
            copy={ingestion.shipstationLabelId}
          />
        ) : null}
      </DetailFacts>
      <DetailFacts label="Order">
        <DetailFact label="Order" value={orderRef} mono copy={order.orderNumber} />
        <DetailFact label="Platform" value={order.accountSource} />
        <DetailFact label="SKU" value={order.sku} mono copy={order.sku} />
        <DetailFact label="Tracking" value={order.trackingNumber} mono copy={order.trackingNumber} />
      </DetailFacts>
      {blocked.length > 0 ? (
        <p className="bg-mode-panel px-mode-page py-3 text-role-caption text-text-muted">
          Your role cannot finish this here: {blocked.join('; ')}.
        </p>
      ) : null}
      <nav aria-label="Order record">
        <DetailNavRow
          href={withJobReturn(`/m/orders/${order.id}?by=id`, here)}
          title="Order"
          meta={`${orderRef} · customer, label, units, activity`}
          icon={<ClipboardList />}
        />
      </nav>
      <DetailDock label="Label exception actions" verbs={verbs} onVerb={onVerb} />

      {linkOpen ? (
        <ShipStationLabelSheet
          open
          onClose={() => setLinkOpen(false)}
          orderId={order.id}
          orderRef={orderRef}
          initialQuery={tracking ?? ''}
          preferShipmentId={ingestion.shipstationShipmentId}
          pending={pendingAction === 'link-to-order'}
          onLink={(link) => void linkToOrder(link)}
        />
      ) : null}
    </>
  );
}
