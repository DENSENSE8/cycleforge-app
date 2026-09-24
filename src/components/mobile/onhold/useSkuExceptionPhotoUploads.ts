'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CapturedShot } from '@/components/mobile/station/MobilePackerSpamCamera';
import { uploadPhotoClient } from '@/lib/photos/upload-client';

interface PendingShot {
  shot: CapturedShot;
  state: 'uploading' | 'failed';
  error: string | null;
}

/**
 * Uploads a camera batch (or picked files) onto a SKU exception — one POST
 * `/api/photos/upload` per shot, entity `SKU_STOCK` (the placeholder's
 * `sku_stock.id`), one at a time so a phone on warehouse Wi-Fi is not racing
 * itself. A failed shot keeps its blob for Retry; `onCommitted` fires once per
 * batch so the screen refetches the server's list. Same contract as the
 * repair's `useRepairPhotoUploads`.
 */
export function useSkuExceptionPhotoUploads(stockId: number, onCommitted: () => void) {
  const [pending, setPending] = useState<PendingShot[]>([]);
  const [lastCommitted, setLastCommitted] = useState(0);
  const onCommittedRef = useRef(onCommitted);
  onCommittedRef.current = onCommitted;

  const run = useCallback(
    async (shots: CapturedShot[]) => {
      const ids = new Set(shots.map((s) => s.id));
      setPending((prev) => [
        ...prev.filter((p) => !ids.has(p.shot.id)),
        ...shots.map((shot) => ({ shot, state: 'uploading' as const, error: null })),
      ]);
      let committed = 0;
      for (const shot of shots) {
        try {
          await uploadPhotoClient({
            file: shot.blob,
            entityType: 'SKU_STOCK',
            entityId: stockId,
            clientCapturedAtMs: shot.capturedAtMs,
          });
          committed += 1;
          URL.revokeObjectURL(shot.previewUrl);
          setPending((prev) => prev.filter((p) => p.shot.id !== shot.id));
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Upload failed';
          setPending((prev) =>
            prev.map((p) => (p.shot.id === shot.id ? { ...p, state: 'failed', error: message } : p)),
          );
        }
      }
      setLastCommitted(committed);
      if (committed > 0) onCommittedRef.current();
    },
    [stockId],
  );

  const retryFailed = useCallback(() => {
    void run(pending.filter((p) => p.state === 'failed').map((p) => p.shot));
  }, [pending, run]);

  const discardFailed = useCallback(() => {
    setPending((prev) => {
      prev.forEach((p) => p.state === 'failed' && URL.revokeObjectURL(p.shot.previewUrl));
      return prev.filter((p) => p.state !== 'failed');
    });
  }, []);

  // Leaving the screen drops whatever is left; release the blob URLs with it.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => () => pendingRef.current.forEach((p) => URL.revokeObjectURL(p.shot.previewUrl)), []);

  return {
    uploading: pending.filter((p) => p.state === 'uploading').length,
    failed: pending.filter((p) => p.state === 'failed'),
    lastCommitted,
    clearCommitted: () => setLastCommitted(0),
    upload: (shots: CapturedShot[]) => void run(shots),
    retryFailed,
    discardFailed,
  };
}
