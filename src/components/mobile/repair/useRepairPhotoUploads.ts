'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CapturedShot } from '@/components/mobile/station/MobilePackerSpamCamera';
import { uploadRepairPhoto } from '@/lib/repair/repair-photos';
import { uploadVideoClient } from '@/lib/photos/video-upload-client';

interface PendingShot {
  shot: CapturedShot;
  state: 'uploading' | 'failed';
  error: string | null;
}

/** The one video in flight (the picker hands over one file at a time). */
export interface PendingVideo {
  file: File;
  state: 'uploading' | 'failed';
  /** 0–1 of the bytes storage has accepted. */
  progress: number;
  error: string | null;
}

/** Uploads a camera batch to the repair (one POST `/api/photos/upload` per shot, entity `REPAIR_SERVICE`), one at a time so a phone on… */
export function useRepairPhotoUploads(repairId: number, onCommitted: () => void) {
  const [pending, setPending] = useState<PendingShot[]>([]);
  const [lastCommitted, setLastCommitted] = useState(0);
  const [video, setVideo] = useState<PendingVideo | null>(null);
  const [videoCommitted, setVideoCommitted] = useState(false);
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
          await uploadRepairPhoto(repairId, shot.blob, { capturedAtMs: shot.capturedAtMs });
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
    [repairId],
  );

  const uploadVideo = useCallback(
    async (file: File) => {
      setVideoCommitted(false);
      setVideo({ file, state: 'uploading', progress: 0, error: null });
      try {
        await uploadVideoClient({
          file,
          entityType: 'REPAIR_SERVICE',
          entityId: repairId,
          onProgress: (progress) => setVideo((v) => (v && v.file === file ? { ...v, progress } : v)),
        });
        setVideo(null);
        setVideoCommitted(true);
        onCommittedRef.current();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Video upload failed';
        setVideo({ file, state: 'failed', progress: 0, error: message });
      }
    },
    [repairId],
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
    videoCommitted,
    clearCommitted: () => {
      setLastCommitted(0);
      setVideoCommitted(false);
    },
    upload: (shots: CapturedShot[]) => void run(shots),
    video,
    uploadVideo: (file: File) => void uploadVideo(file),
    retryVideo: () => {
      if (video?.state === 'failed') void uploadVideo(video.file);
    },
    discardVideo: () => setVideo((v) => (v?.state === 'failed' ? null : v)),
    retryFailed,
    discardFailed,
  };
}
