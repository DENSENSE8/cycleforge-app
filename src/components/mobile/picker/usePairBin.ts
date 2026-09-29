'use client';

/**
 * Pair bin / Update location on the `/m/pick` order screen (owner 2026-09-29):
 * the scan card's own camera, lifted to name the bin — the directed walk's
 * pairing, on the one camera. The scanned (or typed — the camera's own Type
 * entry) code must be a real location (`GET /api/locations/:barcode`); it
 * becomes the SKU's home bin (`POST /api/update-sku-location`, `bin.set` —
 * the desk's write, the list's set-bin sheet's write). Then the location's
 * existing ± count (`/m/pair/:code/:sku`, `putaway.adjust`) opens so the
 * picker confirms how many sit there, and returns here.
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { unwrapScannedLocation } from '@/lib/barcode-routing';
import { feedback } from './usePickOrder';

export function usePairBin({ sku, returnHref }: { sku: string; returnHref: string }) {
  const router = useRouter();
  const [pairing, setPairing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Bumped to lift the camera (`MobileCaptureWindow armRequest`). */
  const [armRequest, setArmRequest] = useState(0);

  const pair = useCallback(
    async (raw: string) => {
      const code = unwrapScannedLocation(raw);
      if (!code || !sku || busy) return;
      setBusy(true);
      setError(null);
      try {
        const lookup = await fetch(`/api/locations/${encodeURIComponent(code)}`, { credentials: 'include', cache: 'no-store' });
        if (lookup.status === 404) throw new Error(`"${code}" is not a location — scan a bin label`);
        const found = (await lookup.json().catch(() => null)) as { location?: { barcode?: string | null } } | null;
        if (!lookup.ok || !found?.location) throw new Error(`Couldn't read that location (${lookup.status})`);
        const barcode = found.location.barcode?.trim() || code;
        const res = await fetch('/api/update-sku-location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sku, location: barcode }),
        });
        const body = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
        if (!res.ok || !body?.success) throw new Error(body?.error || `Pairing failed (${res.status})`);
        feedback('success');
        setPairing(false);
        router.push(`/m/pair/${encodeURIComponent(barcode)}/${encodeURIComponent(sku)}?return=${encodeURIComponent(returnHref)}`);
      } catch (err) {
        feedback('reject');
        setError(err instanceof Error ? err.message : 'Pairing failed — scan the bin again');
      } finally {
        setBusy(false);
      }
    },
    [sku, busy, returnHref, router],
  );

  return {
    pairing,
    busy,
    error,
    armRequest,
    dismissError: () => setError(null),
    start: () => {
      setError(null);
      setPairing(true);
      setArmRequest((n) => n + 1);
    },
    cancel: () => setPairing(false),
    pair,
  };
}
