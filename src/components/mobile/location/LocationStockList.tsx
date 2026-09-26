'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { vibrateScan } from '@/lib/scan-feedback/play';
import { takeReasonPayload, type TakeReasonChoice } from '@/lib/inventory/take-reason';
import { locationKeypadHref } from '@/lib/mobile/location-hub-href';
import { TakeReasonChooser } from '@/components/mobile/pair/TakeReasonChooser';
import { LocationQtyStrip } from '@/components/mobile/scan/LocationQtyStrip';
import { useBinQtyCommit } from '@/components/mobile/scan/use-bin-qty-commit';
import { locationRecordQueryKey } from '@/components/mobile/scan/location-bind-api';
import type { LocationBindContent, LocationRecord } from '@/components/mobile/scan/location-bind-types';

/** Every SKU in the location with its live count and the ± strip — the location hub's working set. */
export function LocationStockList({ record, returnTo }: { record: LocationRecord; returnTo: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const key = useMemo(() => locationRecordQueryKey(record.code), [record.code]);
  const [error, setError] = useState<string | null>(null);
  const [takeReason, setTakeReason] = useState<TakeReasonChoice>(null);
  const takePayload = useMemo(() => takeReasonPayload(takeReason), [takeReason]);
  const commitReason = useMemo(
    () => (takePayload.ok ? { reason: takePayload.reason, notes: takePayload.notes } : undefined),
    [takePayload],
  );

  /** Apply a change to one SKU's committed qty in the hub cache, dropping emptied rows. */
  const applyQty = useCallback(
    (sku: string, next: (prev: number) => number) => {
      queryClient.setQueryData<LocationRecord>(key, (prev) =>
        prev
          ? {
              ...prev,
              contents: prev.contents
                .map((row) => (row.sku === sku ? { ...row, qty: Math.max(0, next(row.qty)) } : row))
                .filter((row) => row.qty > 0),
            }
          : prev,
      );
    },
    [key, queryClient],
  );

  const quick = useBinQtyCommit({
    binBarcode: record.code,
    staffId: user?.staffId ?? 0,
    invalidateKey: key,
    takeReason: commitReason,
    onCommitStart: useCallback((sku: string, delta: number) => applyQty(sku, (prev) => prev + delta), [applyQty]),
    // `binQty` is the server's answer and outranks the optimistic maths;
    // offline writes have none, so the folded delta stands.
    onCommitted: useCallback(
      ({ sku, binQty }: { sku: string; binQty: number | null }) => {
        if (binQty != null) applyQty(sku, () => binQty);
      },
      [applyQty],
    ),
    onFailed: useCallback(
      ({ sku, delta, message }: { sku: string; delta: number; message: string }) => {
        applyQty(sku, (prev) => prev - delta);
        setError(message);
      },
      [applyQty],
    ),
  });

  const bump = useCallback(
    (row: LocationBindContent, step: number) => {
      setError(null);
      if (step < 0 && !takePayload.ok) {
        setError(takePayload.error);
        vibrateScan('reject');
        return false;
      }
      const accepted = quick.bump(row.sku, step, row.qty);
      // A refused tap is the floor clamp — the reject pattern says "that did
      // nothing" without the operator having to look up.
      vibrateScan(accepted ? 'success' : 'reject');
      return accepted;
    },
    [quick, takePayload],
  );

  const changeReason = useCallback(
    (next: TakeReasonChoice) => {
      void quick.flush();
      setTakeReason(next);
    },
    [quick],
  );

  const openKeypad = useCallback(
    (row: LocationBindContent) => {
      // Commit what the thumb already counted so the keypad opens on the real on-hand.
      void quick.flush();
      router.push(locationKeypadHref(record.code, row.sku, { returnTo }));
    },
    [quick, record.code, returnTo, router],
  );

  if (record.contents.length === 0) return null;

  return (
    <div className="space-y-3 px-mode-page py-mode-page" data-testid="location-stock">
      <TakeReasonChooser value={takeReason} onChange={changeReason} label="Quick − takes for" />
      {error && (
        <p role="alert" className="text-role-caption text-text-danger">
          {error}
        </p>
      )}
      {record.contents.map((row) => (
        <LocationQtyStrip
          key={row.sku}
          content={row}
          pendingDelta={quick.pending[row.sku] ?? 0}
          onBump={(step) => bump(row, step)}
          onCancelPending={() => quick.cancel(row.sku)}
          onOpenKeypad={() => openKeypad(row)}
        />
      ))}
    </div>
  );
}
