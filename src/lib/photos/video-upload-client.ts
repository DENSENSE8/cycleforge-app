import type { PhotoEntityType } from './types';
import { validateVideoUpload, type VideoMime } from './video-upload-rules';

export interface ClientVideoUploadInput {
  file: File;
  entityType: PhotoEntityType;
  entityId: number;
  /** Fraction 0–1 of the bytes GCS has accepted. */
  onProgress?: (fraction: number) => void;
}

export interface ClientVideoUploadResult {
  id: number;
  url: string;
  contentType: VideoMime;
  sizeBytes: number;
  createdAt: string;
}

/**
 * Browser video upload — the video twin of `uploadPhotoClient`, routed by the
 * same `entityType` + `entityId`, so any entity screen can reuse it:
 *
 *   1. `POST /api/photos/upload/video` → a pending row + a signed GCS PUT.
 *   2. `PUT uploadUrl` straight to the bucket with exactly the signed `headers`
 *      (XMLHttpRequest, for upload progress).
 *   3. `POST /api/photos/upload/video/{videoId}/finalize` → the server checks
 *      what GCS stored and marks it ready.
 *
 * The pre-check refuses an unsupported or empty file before any request; the
 * size cap is the server's (`PHOTOS_VIDEO_MAX_BYTES`) and comes back as the
 * create step's error. A failure at any step rejects with an operator-readable
 * message; calling again starts a fresh upload (an abandoned pending row is
 * never listed).
 */
export async function uploadVideoClient(input: ClientVideoUploadInput): Promise<ClientVideoUploadResult> {
  const { file } = input;
  const verdict = validateVideoUpload(
    { contentType: file.type, sizeBytes: file.size, fileName: file.name },
    Number.MAX_SAFE_INTEGER,
  );
  if (!verdict.ok) throw new Error(verdict.error);

  const created = await postJson<{ videoId: number; uploadUrl: string; headers: Record<string, string> }>(
    '/api/photos/upload/video',
    {
      entityType: input.entityType,
      entityId: input.entityId,
      contentType: verdict.contentType,
      sizeBytes: file.size,
      fileName: file.name,
    },
  );

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', created.uploadUrl);
    for (const [name, value] of Object.entries(created.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) input.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Storage refused the video (${xhr.status})`));
    xhr.onerror = () => reject(new Error('The video upload lost its connection — retry on a steadier network.'));
    xhr.send(file);
  });
  input.onProgress?.(1);

  return postJson<ClientVideoUploadResult>(`/api/photos/upload/video/${created.videoId}/finalize`, {});
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string; details?: string }) | null;
  if (!res.ok || !data) throw new Error(data?.details || data?.error || `Video upload failed (${res.status})`);
  return data;
}
