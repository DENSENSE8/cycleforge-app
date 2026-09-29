'use client';

/**
 * Tracking — an open `tracking_exceptions` row: a scanned tracking number the
 * system could not match. Refresh re-asks Zoho (it closes itself on a match);
 * otherwise the operator fixes the number, or closes the row as resolved or
 * discarded with a note.
 */

import { useEffect, useState } from 'react';
import { Check, RefreshCw, Trash2 } from '@/components/Icons';
import { DetailFact, DetailFacts } from '@/components/mobile/detail/DetailParts';
import { DetailDock } from '@/design-system/components/DetailDock';
import { TextField } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { useResolveTrackingException } from '@/hooks/exceptions';
import type { TrackingExceptionFacts } from '@/lib/exceptions/facts';
import { toast } from '@/lib/toast';
import { formatMonthDayTimePST } from '@/utils/date';
import type { PhoneResolverProps } from './resolver-props';

type TrackingVerb = 'refresh' | 'discard' | 'resolve';

export function TrackingResolver({ facts, onResolved }: PhoneResolverProps<TrackingExceptionFacts>) {
  const { has } = useAuth();
  const canWrite = has('receiving.mark_received');
  const resolve = useResolveTrackingException();
  const exception = facts.exception;
  const [trackingNumber, setTrackingNumber] = useState(exception.trackingNumber);
  const [notes, setNotes] = useState(exception.notes ?? '');
  useEffect(() => {
    setTrackingNumber(exception.trackingNumber);
    setNotes(exception.notes ?? '');
  }, [exception.trackingNumber, exception.notes]);

  const pendingVerb: TrackingVerb | null = !resolve.isPending
    ? null
    : resolve.variables?.action === 'refresh'
      ? 'refresh'
      : resolve.variables?.patch.status === 'discarded'
        ? 'discard'
        : 'resolve';

  const close = (status: 'resolved' | 'discarded') => {
    const nextTracking = trackingNumber.trim();
    const nextNotes = notes.trim();
    return resolve
      .mutateAsync({
        action: 'update',
        id: exception.id,
        patch: {
          status,
          notes: nextNotes || null,
          ...(nextTracking && nextTracking !== exception.trackingNumber ? { tracking_number: nextTracking } : {}),
        },
      })
      .then(
        () => onResolved(status === 'resolved' ? `${exception.trackingNumber} resolved.` : `${exception.trackingNumber} discarded.`),
        (error: Error) => toast.error(error.message || 'Could not update the tracking exception.'),
      );
  };

  const onVerb = (verb: TrackingVerb) =>
    verb === 'refresh'
      ? resolve.mutateAsync({ action: 'refresh', id: exception.id }).then(
          () => toast.success('Checked Zoho again — the row closes itself once it matches.'),
          (error: Error) => toast.error(error.message || 'Could not refresh.'),
        )
      : close(verb === 'discard' ? 'discarded' : 'resolved');

  return (
    <>
      <DetailFacts label="Tracking exception">
        <DetailFact label="Tracking" value={exception.trackingNumber} mono copy={exception.trackingNumber} />
        <DetailFact label="Side" value={exception.domain === 'orders' ? 'Outbound' : 'Receiving'} />
        <DetailFact label="Reason" value={exception.exceptionReason} />
        <DetailFact label="Scanned at" value={exception.sourceStation} hint={exception.staffName} />
        <DetailFact
          label="Zoho checks"
          value={String(exception.zohoCheckCount)}
          hint={exception.lastZohoCheckAt ? `last ${formatMonthDayTimePST(exception.lastZohoCheckAt)}` : null}
        />
        <DetailFact label="Last error" value={exception.lastError} />
      </DetailFacts>
      <div className="divide-y divide-mode-rule">
        <TextField appearance="flush" label="Tracking number" value={trackingNumber} onChange={setTrackingNumber} mono />
        <TextField appearance="flush" label="Note" value={notes} onChange={setNotes} />
      </div>
      {!canWrite ? (
        <p className="bg-mode-panel px-mode-page py-2 text-role-caption text-text-muted">
          Closing a tracking exception needs the receiving permission.
        </p>
      ) : null}
      <div className="flex-1 bg-mode-panel" />
      <DetailDock
        label="Tracking exception actions"
        verbs={[
          { id: 'refresh', label: 'Refresh', icon: <RefreshCw />, disabled: !canWrite, loading: pendingVerb === 'refresh' },
          { id: 'discard', label: 'Discard', icon: <Trash2 />, disabled: !canWrite, loading: pendingVerb === 'discard' },
          { id: 'resolve', label: 'Resolve', icon: <Check />, primary: true, disabled: !canWrite, loading: pendingVerb === 'resolve' },
        ]}
        onVerb={onVerb}
      />
    </>
  );
}
