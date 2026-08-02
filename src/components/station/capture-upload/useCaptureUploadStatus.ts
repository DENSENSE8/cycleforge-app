'use client';

import { useCallback, useMemo } from 'react';
import {
  photoUploadQueue,
  useUploadQueue,
} from '@/components/mobile/receiving/PhotoUploadQueue';
import {
  packerPhotoUploadQueue,
  usePackerUploadQueue,
} from '@/components/mobile/packer/PackerPhotoUploadQueue';
import {
  unitPhotoUploadQueue,
  useUnitUploadQueue,
} from '@/components/mobile/unit/UnitPhotoUploadQueue';
import {
  summarizeCaptureUploads,
  type CaptureUploadDomain,
  type CaptureUploadEntry,
  type CaptureUploadState,
  type CaptureUploadSummary,
} from './capture-upload-model';

/**
 * Adapter: the three capture queues → one normalized {@link CaptureUploadEntry}
 * list, plus the actions the card needs.
 *
 * This is the ONLY place that knows there are three queues. The card takes
 * plain props, so a future bench (or a desk-side surface reading a different
 * source) mounts the same component without inheriting this coupling — which is
 * what makes the compound a house primitive rather than a phone widget.
 *
 * ### Why all three, when P0 only required two
 *
 * The locked P0 gate is "prove the SoT across ≥2 domains" (Receiving + Pack), to
 * stop an Unbox-shaped component shipping under a general name. Unioning is
 * strictly cheaper than filtering one out — the three queues expose a
 * byte-identical public API (`retry(id)` · `clearDone()` · `subscribe` ·
 * `snapshot`) — so excluding Unit would have been extra code buying a smaller
 * proof.
 *
 * ### D5 note (see the program prompt)
 *
 * That identical API is also the evidence D5 is deferred, not settled: after
 * normalizing names the packer and unit queues differ by 127 lines out of ~330.
 * The duplication is in the ENGINE. This adapter unifies the *reading* of it;
 * it does not pretend the three singletons are one. Do not cite this file as
 * proof the fork is resolved.
 */

/** Queue `done` is the queue's bookkeeping; `committed` is the operator's fact. */
function normalizeState(raw: 'queued' | 'uploading' | 'done' | 'failed'): CaptureUploadState {
  return raw === 'done' ? 'committed' : raw;
}

const QUEUES = {
  receiving: photoUploadQueue,
  pack: packerPhotoUploadQueue,
  unit: unitPhotoUploadQueue,
} as const satisfies Record<CaptureUploadDomain, { retry(id: string): void; clearDone(): void }>;

export interface CaptureUploadStatusModel {
  entries: CaptureUploadEntry[];
  summary: CaptureUploadSummary;
  /** Re-run one failed upload. No-op if the entry already left the queue. */
  retry: (entry: Pick<CaptureUploadEntry, 'domain' | 'id'>) => void;
  /** Re-run every failed upload across every domain. */
  retryAllFailed: () => void;
  /** Drop committed entries so the resting confirmation does not accumulate. */
  dismissCommitted: () => void;
}

export function useCaptureUploadStatus(): CaptureUploadStatusModel {
  // Unfiltered reads — the dock is shell-level and must show whatever is in
  // flight regardless of which record the operator has navigated to. A scoped
  // consumer filters the returned list; it must not narrow the subscription,
  // or a photo uploading for the PO you just left goes silent mid-flight.
  const receiving = useUploadQueue();
  const pack = usePackerUploadQueue();
  const unit = useUnitUploadQueue();

  const entries = useMemo<CaptureUploadEntry[]>(() => {
    const merged: CaptureUploadEntry[] = [];
    const push = (domain: CaptureUploadDomain, rows: typeof receiving | typeof pack | typeof unit) => {
      for (const e of rows) {
        merged.push({
          id: e.id,
          domain,
          state: normalizeState(e.state),
          previewUrl: e.previewUrl,
          error: e.error,
          createdAt: e.createdAt,
        });
      }
    };
    push('receiving', receiving);
    push('pack', pack);
    push('unit', unit);
    // Oldest first: the operator reads the dock top-down and the shot they took
    // first is the one they are still waiting on.
    return merged.sort((a, b) => a.createdAt - b.createdAt);
  }, [receiving, pack, unit]);

  const summary = useMemo(() => summarizeCaptureUploads(entries), [entries]);

  const retry = useCallback((entry: Pick<CaptureUploadEntry, 'domain' | 'id'>) => {
    QUEUES[entry.domain].retry(entry.id);
  }, []);

  const retryAllFailed = useCallback(() => {
    for (const e of entries) {
      if (e.state === 'failed') QUEUES[e.domain].retry(e.id);
    }
  }, [entries]);

  const dismissCommitted = useCallback(() => {
    // Every domain, not just the ones with committed rows today — clearDone() is
    // a cheap no-op on an empty queue, and enumerating "which domains had
    // successes" here would be a second place to keep the domain list correct.
    for (const q of Object.values(QUEUES)) q.clearDone();
  }, []);

  return { entries, summary, retry, retryAllFailed, dismissCommitted };
}
