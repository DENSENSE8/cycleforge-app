'use client';

/** Repair reason labels for the SKU in front of the customer, on the KIOSK. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/lib/toast';
import { kioskFetchHealed } from '@/lib/kiosk/kiosk-self-heal';
import { mergeReasonLabel, visibleReasonBase } from '@/lib/repair/sku-reasons';

const ENDPOINT = '/api/kiosk/repair/issues';

export interface KioskSkuReasons {
  /** Labels to render as pills — global reasons plus this SKU's own. */
  labels: string[];
  /** True while a reason is being persisted. */
  adding: boolean;
  /** Optimistically add a reason for this SKU. Resolves true when persisted. */
  addReason: (label: string) => Promise<boolean>;
}

export function useKioskSkuReasons(sku: string | null | undefined): KioskSkuReasons {
  const [labels, setLabels] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  /** Labels this tablet added for the CURRENT sku, replayed onto every load result. */
  const addedRef = useRef<{ sku: string | null; labels: string[] }>({ sku: null, labels: [] });
  const skuKey = sku ?? null;
  if (addedRef.current.sku !== skuKey) {
    addedRef.current = { sku: skuKey, labels: [] };
  }

  useEffect(() => {
    let active = true;
    const url = sku ? `${ENDPOINT}?sku=${encodeURIComponent(sku)}` : ENDPOINT;
    kioskFetchHealed(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active) return;
        const loaded: string[] = Array.isArray(data?.labels) ? data.labels.map(String) : [];
        setLabels(
          addedRef.current.labels.reduce(
            (acc, added) => mergeReasonLabel(acc, added),
            loaded,
          ),
        );
      })
      .catch(() => {
        // Keep whatever is on screen; with no labels at all the pills fall
        // back to the built-in registry (see ReasonSelector).
      });
    return () => {
      active = false;
    };
  }, [sku]);

  const addReason = useCallback(
    async (label: string): Promise<boolean> => {
      const trimmed = label.trim();
      if (!trimmed || !sku) return false;

      // Paint first. `visibleReasonBase` is why: with an empty DB list the
      // pills are showing the built-in registry, so appending to `[]` would
      // make those reasons disappear the moment the first one is added.
      const previous = labels;
      setLabels(mergeReasonLabel(visibleReasonBase(labels), trimmed));
      addedRef.current.labels = mergeReasonLabel(addedRef.current.labels, trimmed);
      setAdding(true);
      try {
        const res = await kioskFetchHealed(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sku, label: trimmed }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return true;
      } catch {
        setLabels(previous);
        addedRef.current.labels = addedRef.current.labels.filter((l) => l !== trimmed);
        toast.error(`Could not save "${trimmed}" for this device`);
        return false;
      } finally {
        setAdding(false);
      }
    },
    [labels, sku],
  );

  return { labels, adding, addReason };
}
