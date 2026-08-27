'use client';

/**
 * Session-only Arrival batch-sort state. Reload / leaving triage clears it —
 * that is the safety valve when an operator gets interrupted mid-batch.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ArrivalScanMode } from '@/lib/receiving/arrival-command-routing';
import {
  pushArrivalBatchEntry,
  removeArrivalBatchEntry,
  type ArrivalBatchEntry,
} from '@/lib/receiving/arrival-batch-sort';
import { resolveTriageLane } from '@/lib/receiving/triage-lane-policy';
import { toast } from '@/lib/toast';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { useQueryClient } from '@tanstack/react-query';

export function useArrivalBatchSortSession(active: boolean) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<ArrivalScanMode>('default');
  const [batch, setBatch] = useState<ArrivalBatchEntry[]>([]);
  const [committing, setCommitting] = useState(false);

  // Leave triage → drop session.
  useEffect(() => {
    if (!active) {
      setMode('default');
      setBatch([]);
    }
  }, [active]);

  const enterBatchSort = useCallback(() => {
    setMode((prev) => {
      if (prev === 'batch_sort') {
        toast.message('Already in batch sort');
        return prev;
      }
      toast.success('Batch sort armed');
      return 'batch_sort';
    });
  }, []);

  const exitToDefault = useCallback(() => {
    setMode((prev) => {
      if (prev === 'default') return prev;
      toast.message('Back to Arrival lookup');
      return 'default';
    });
    setBatch([]);
  }, []);

  const pushResolved = useCallback((entry: ArrivalBatchEntry) => {
    setBatch((prev) => {
      const next = pushArrivalBatchEntry(prev, entry);
      if (next === prev) {
        toast.message('Already in batch');
        return prev;
      }
      toast.success(`Batched · ${next.length}`);
      return next;
    });
  }, []);

  const removeOne = useCallback((receivingId: number) => {
    setBatch((prev) => removeArrivalBatchEntry(prev, receivingId));
  }, []);

  /**
   * Resolve shelf barcode → location id, PATCH each batched carton’s
   * staging_location_id (+ auto lane), clear the strip, stay in batch_sort.
   */
  const commitBatchToLocation = useCallback(
    async (locationBarcode: string) => {
      if (batch.length === 0) {
        toast.error('Batch is empty — scan tracking first');
        return;
      }
      setCommitting(true);
      try {
        const locRes = await fetch(
          `/api/locations/${encodeURIComponent(locationBarcode)}`,
          { cache: 'no-store' },
        );
        const locData = (await locRes.json().catch(() => ({}))) as {
          location?: { id?: number; name?: string };
          error?: string;
        };
        if (!locRes.ok || locData.location?.id == null) {
          toast.error(locData.error || `Shelf not found: ${locationBarcode}`);
          return;
        }
        const locationId = locData.location.id;
        const locationName = locData.location.name ?? locationBarcode;

        const results = await Promise.all(
          batch.map(async (entry) => {
            const autoLane = resolveTriageLane(entry.priorityLane, {
              isReturn: entry.isReturn,
              isPriority: entry.isPriority,
            });
            const patch: {
              staging_location_id: number;
              priority_lane?: string;
            } = { staging_location_id: locationId };
            if (autoLane) patch.priority_lane = autoLane;

            try {
              const res = await fetch(`/api/receiving/${entry.receivingId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patch),
              });
              const data = (await res.json().catch(() => ({}))) as {
                success?: boolean;
                error?: string;
              };
              if (!res.ok || !data?.success) {
                return { ok: false as const, entry, error: data?.error };
              }
              return { ok: true as const, entry };
            } catch {
              return { ok: false as const, entry, error: 'network' };
            }
          }),
        );

        const okCount = results.filter((r) => r.ok).length;
        const failCount = results.length - okCount;
        invalidateReceivingFeeds(queryClient);

        if (failCount === 0) {
          toast.success(`Staged ${okCount} → ${locationName}`);
          setBatch([]);
        } else if (okCount === 0) {
          toast.error(`Could not stage any of ${results.length} cartons`);
        } else {
          toast.error(`Staged ${okCount}, failed ${failCount}`);
          // Keep failed entries in the batch for retry.
          const failedIds = new Set(
            results.filter((r) => !r.ok).map((r) => r.entry.receivingId),
          );
          setBatch((prev) => prev.filter((e) => failedIds.has(e.receivingId)));
        }
      } finally {
        setCommitting(false);
      }
    },
    [batch, queryClient],
  );

  return {
    mode,
    batch,
    committing,
    isBatchSort: mode === 'batch_sort',
    enterBatchSort,
    exitToDefault,
    pushResolved,
    removeOne,
    commitBatchToLocation,
  };
}