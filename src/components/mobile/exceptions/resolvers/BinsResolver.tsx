'use client';

/**
 * Bin errors — an open drift alert (counted vs expected at a location). The
 * operator recounts at the bin (the location record is one tap away), then
 * acknowledges the alert with what they found.
 */

import { useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Check, MapPin } from '@/components/Icons';
import { DetailFact, DetailFacts, DetailNavRow } from '@/components/mobile/detail/DetailParts';
import { DetailDock } from '@/design-system/components/DetailDock';
import { TextField } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { useResolveBinsException } from '@/hooks/exceptions';
import type { BinsExceptionFacts } from '@/lib/exceptions/facts';
import { withJobReturn } from '@/lib/mobile/nav-trail';
import { toast } from '@/lib/toast';
import { formatMonthDayTimePST } from '@/utils/date';
import type { PhoneResolverProps } from './resolver-props';

export function BinsResolver({ facts, onResolved }: PhoneResolverProps<BinsExceptionFacts>) {
  const { has } = useAuth();
  const canAck = has('stock_alerts.ack');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const resolve = useResolveBinsException();
  const alert = facts.alert;
  const [note, setNote] = useState('');
  const here = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ''}`;

  const acknowledge = () =>
    resolve
      .mutateAsync({ alertId: alert.id, ...(note.trim() ? { note: note.trim() } : {}) })
      .then(
        () => onResolved(`Bin alert for ${alert.sku} acknowledged.`),
        (error: Error) => toast.error(error.message || 'Could not acknowledge the alert.'),
      );

  return (
    <>
      <DetailFacts label="Drift alert">
        <DetailFact label="SKU" value={alert.sku} mono copy={alert.sku} />
        <DetailFact label="Title" value={alert.productTitle} />
        <DetailFact label="Bin" value={alert.binBarcode} mono copy={alert.binBarcode} />
        <DetailFact label="Drift" value={alert.qtyAtTrigger == null ? null : String(alert.qtyAtTrigger)} />
        <DetailFact label="Evidence" value={alert.notes} mono />
        {alert.raisedAt ? <DetailFact label="Raised" value={formatMonthDayTimePST(alert.raisedAt)} /> : null}
      </DetailFacts>
      {alert.binBarcode ? (
        <nav aria-label="Bin record">
          <DetailNavRow
            href={withJobReturn(`/m/loc/${encodeURIComponent(alert.binBarcode)}`, here)}
            title="Recount at the bin"
            meta={`${alert.binBarcode} · what is on the shelf now`}
            icon={<MapPin />}
          />
        </nav>
      ) : null}
      <TextField
        appearance="flush"
        label="What you found"
        value={note}
        onChange={setNote}
        placeholder="Recounted 4 — ledger corrected"
      />
      {!canAck ? (
        <p className="bg-mode-panel px-mode-page py-2 text-role-caption text-text-muted">
          Acknowledging a bin alert needs the stock-alert permission.
        </p>
      ) : null}
      <DetailDock
        label="Bin error actions"
        verbs={[{ id: 'ack', label: 'Acknowledge', icon: <Check />, primary: true, disabled: !canAck, loading: resolve.isPending }]}
        onVerb={() => acknowledge()}
      />
    </>
  );
}
