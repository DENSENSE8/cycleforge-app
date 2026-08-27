'use client';

import { useCallback, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bustScanOutCaches } from '@/lib/outbound/outbound-cache-keys';

export interface ScanOutResult {
  ok: boolean;
  matched: boolean;
  duplicate?: boolean;
  alreadyDelivered?: boolean;
  shipmentId?: number;
  tracking?: string | null;
  orderId?: string | null;
  productTitle?: string | null;
  message?: string | null;
}

export type ScanOutStatus = 'ok' | 'dup' | 'miss' | 'err' | 'exc';

/** The single active-package result — replaces on each scan (Station contract). */
export interface ActiveScanOut {
  status: ScanOutStatus;
  result: ScanOutResult | null;
  /** Human-readable one-liner for compact readouts. */
  text: string;
}

/**
 * Scan-out station controller — the SHIP_CONFIRM scan loop shared by the dock
 * Station body and any compact bar. Owns scan value + focus, the
 * `POST/DELETE /api/shipped/scan-out` mutations, the single active result, and
 * the undoable handle. Presentation stays in the view.
 */
export function useScanOutStation() {
  const queryClient = useQueryClient();
  const [scanValue, setScanValue] = useState('');
  const [active, setActive] = useState<ActiveScanOut | null>(null);
  const [undoable, setUndoable] = useState<{ shipmentId: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refocus = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const bustCaches = useCallback(() => {
    bustScanOutCaches(queryClient);
  }, [queryClient]);

  const scanOut = useMutation({
    mutationFn: async (tracking: string): Promise<ScanOutResult> => {
      const res = await fetch('/api/shipped/scan-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingNumber: tracking }),
      });
      if (!res.ok) throw new Error(`scan-out failed (${res.status})`);
      return res.json();
    },
    onSuccess: (result) => {
      setUndoable(null);
      if (!result.matched) {
        setActive({ status: 'miss', result, text: result.message || 'No shipment found for that label' });
        return;
      }
      if (result.alreadyDelivered) {
        setActive({ status: 'exc', result, text: 'Delivered already' });
        return;
      }
      if (result.duplicate) {
        setActive({ status: 'dup', result, text: 'Already scanned out' });
        return;
      }
      setActive({ status: 'ok', result, text: 'Shipped out' });
      if (result.shipmentId) setUndoable({ shipmentId: result.shipmentId });
      bustCaches();
    },
    onError: () => {
      setActive({ status: 'err', result: null, text: 'Scan-out failed — try again' });
    },
  });

  const undoMutation = useMutation({
    mutationFn: async (shipmentId: number): Promise<void> => {
      const res = await fetch('/api/shipped/scan-out', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipmentId }),
      });
      if (!res.ok) throw new Error(`undo failed (${res.status})`);
    },
    onSuccess: () => {
      setUndoable(null);
      setActive(null);
      bustCaches();
      refocus();
    },
    onError: () => {
      setActive({ status: 'err', result: null, text: 'Undo failed — try again' });
    },
  });

  const submitRaw = useCallback(
    (raw: string) => {
      const v = raw.trim();
      if (!v || scanOut.isPending) return;
      scanOut.mutate(v);
      setScanValue('');
      refocus();
    },
    [scanOut, refocus],
  );

  const submit = useCallback(() => {
    submitRaw(scanValue);
  }, [scanValue, submitRaw]);

  const undo = useCallback(() => {
    if (undoable) undoMutation.mutate(undoable.shipmentId);
  }, [undoable, undoMutation]);

  return {
    scanValue,
    setScanValue,
    inputRef,
    refocus,
    active,
    undoable,
    submit,
    submitRaw,
    undo,
    isScanning: scanOut.isPending,
    isUndoing: undoMutation.isPending,
  };
}
