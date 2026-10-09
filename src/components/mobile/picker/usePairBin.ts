'use client';

/**
 * Pair / Update on the `/m/pick` order screen (owner 2026-09-29; 2026-10-08): the scan card's own camera,
 * lifted alone (no dock) to name the bin. A scanned bin label or tote — or, keyed by hand, a tote number
 * on the pad — pairs through {@link pairSkuToLocation}; a location chosen by hand opens the stock
 * drill-down ({@link stockPairHref}). Pairing is only pairing (owner 2026-10-08): no take / put-away count
 * follows — the pick screen stays, and the card repaints with the bin.
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toShipQueueQuery } from '@/lib/orders/to-ship-queue';
import { pairSkuToLocation, stockPairHref } from '@/lib/picking/pair-sku-location';
import { refreshDomain } from '@/lib/refresh/bus';
import { toast } from '@/lib/toast';
import { feedback } from './usePickOrder';

export function usePairBin({ sku, returnHref }: { sku: string; returnHref: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pairing, setPairing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Bumped to lift the camera (`MobileCaptureWindow armRequest`). */
  const [armRequest, setArmRequest] = useState(0);
  /** Bumped once paired: the camera goes away and the pick screen's dock returns. */
  const [disarmRequest, setDisarmRequest] = useState(0);

  const pair = useCallback(
    async (raw: string, as: 'auto' | 'tote' = 'auto') => {
      if (!raw.trim() || !sku || busy) return;
      setBusy(true);
      setError(null);
      try {
        const barcode = await pairSkuToLocation(sku, raw, { as });
        feedback('success');
        setPairing(false);
        setDisarmRequest((n) => n + 1);
        toast.success(`${sku} paired to ${barcode}`);
        await queryClient.invalidateQueries({ queryKey: toShipQueueQuery().queryKey });
        refreshDomain('orders.outbound');
      } catch (err) {
        feedback('reject');
        setError(err instanceof Error ? err.message : 'Pairing failed — scan the bin again');
      } finally {
        setBusy(false);
      }
    },
    [sku, busy, queryClient],
  );

  return {
    pairing,
    busy,
    error,
    armRequest,
    disarmRequest,
    dismissError: () => setError(null),
    start: () => {
      setError(null);
      setPairing(true);
      setArmRequest((n) => n + 1);
    },
    cancel: () => setPairing(false),
    pair,
    /** Choose the location by hand in the stock drill-down; it returns here once paired. */
    chooseLocation: () => router.push(stockPairHref(sku, returnHref)),
  };
}
