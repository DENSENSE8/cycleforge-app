'use client';

import { useState } from 'react';
import { Button } from '@/design-system/primitives';
import { Camera } from '@/components/Icons';
import {
  MobilePackerSpamCamera,
  type CapturedShot,
} from '@/components/mobile/station/MobilePackerSpamCamera';
import { photoContentUrl } from '@/lib/photos/display-url';
import { uploadRepairPhoto } from '@/lib/repair/repair-photos';
import { BENCH_PHOTO_TYPE, type BenchPhotoSide } from '@/lib/repair/repair-actions';

const SIDE_LABEL: Record<BenchPhotoSide, string> = { before: 'Before', after: 'After' };

/**
 * Before / after shots taken while logging work (e.g. the solder joint). They
 * are plain repair photos — the one repair upload (`uploadRepairPhoto` →
 * `/api/photos/upload`, entity REPAIR_SERVICE keyed to the repair id, the same
 * way intake photos are), sent the moment the camera closes, and they show on
 * the repair's Photos screen with the rest. Nothing ties them to the log entry.
 * The thumbnails here only confirm what was just uploaded.
 */
export function RepairBenchPhotoField({
  repairId,
  side,
  disabled,
}: {
  repairId: number;
  side: BenchPhotoSide;
  disabled?: boolean;
}) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [uploaded, setUploaded] = useState<number[]>([]);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const upload = async (shots: CapturedShot[]) => {
    setCameraOpen(false);
    if (shots.length === 0) return;
    setError(null);
    setUploading(shots.length);
    let failed = 0;
    for (const shot of shots) {
      try {
        const res = await uploadRepairPhoto(repairId, shot.blob, {
          photoType: BENCH_PHOTO_TYPE[side],
          capturedAtMs: shot.capturedAtMs,
        });
        setUploaded((ids) => [...ids, res.id]);
      } catch {
        failed += 1;
      } finally {
        URL.revokeObjectURL(shot.previewUrl);
        setUploading((n) => n - 1);
      }
    }
    if (failed > 0) setError(`${failed} photo${failed === 1 ? '' : 's'} did not upload — take ${failed === 1 ? 'it' : 'them'} again.`);
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-role-caption font-semibold text-mode-muted">{SIDE_LABEL[side]} photo</span>
        <Button
          variant="ghost"
          size="sm"
          icon={<Camera className="h-4 w-4" />}
          onClick={() => setCameraOpen(true)}
          disabled={disabled || uploading > 0}
          loading={uploading > 0}
        >
          {uploading > 0 ? 'Uploading' : uploaded.length > 0 ? 'Add' : 'Take'}
        </Button>
      </div>
      {uploaded.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label={`${SIDE_LABEL[side]} photos`}>
          {uploaded.map((id) => (
            <li key={id}>
              {/* eslint-disable-next-line @next/next/no-img-element -- auth-gated content route, not a static asset */}
              <img
                src={photoContentUrl(id, 'thumb')}
                alt={`${SIDE_LABEL[side]} photo`}
                className="h-16 w-16 rounded-mode border border-mode-edge object-cover"
              />
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="mt-1 text-role-caption font-semibold text-rose-700">{error}</p> : null}
      {cameraOpen ? (
        <MobilePackerSpamCamera
          maxPhotos={4}
          header={`${SIDE_LABEL[side]} · RS-${repairId}`}
          onDone={(shots) => void upload(shots)}
          onCancel={() => setCameraOpen(false)}
        />
      ) : null}
    </div>
  );
}
