/** Pure rules for entity video uploads (`POST /api/photos/upload/video`) — shared by the browser (pre-check before asking for a signed URL)… */

/** Container → canonical file extension for the object key. */
export const VIDEO_MIME_EXTENSIONS = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
} as const;

export type VideoMime = keyof typeof VIDEO_MIME_EXTENSIONS;

/** Filename extensions a phone may hand us, per container. */
const EXTENSION_TO_MIME: Readonly<Record<string, VideoMime>> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  qt: 'video/quicktime',
  webm: 'video/webm',
};

/** 500 MB — roughly five minutes of 1080p from a current phone. */
export const DEFAULT_VIDEO_MAX_BYTES = 500 * 1024 * 1024;

/** `PHOTOS_VIDEO_MAX_BYTES` when it is a positive integer, else the default. */
export function resolveVideoMaxBytes(raw: string | undefined | null): number {
  const n = Number((raw ?? '').trim());
  return Number.isSafeInteger(n) && n > 0 ? n : DEFAULT_VIDEO_MAX_BYTES;
}

function extensionOf(fileName: string | null | undefined): string | null {
  const name = (fileName ?? '').trim();
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return null;
  return name.slice(dot + 1).toLowerCase();
}

/** `video/MP4; codecs=avc1` → `video/mp4`. Empty stays empty. */
export function normalizeMime(raw: string | null | undefined): string {
  return (raw ?? '').split(';')[0].trim().toLowerCase();
}

function isVideoMime(mime: string): mime is VideoMime {
  return Object.prototype.hasOwnProperty.call(VIDEO_MIME_EXTENSIONS, mime);
}

interface VideoUploadClaim {
  contentType: string | null | undefined;
  sizeBytes: number;
  fileName?: string | null;
}

type VideoUploadVerdict =
  | { ok: true; contentType: VideoMime; extension: string }
  | { ok: false; error: string };

/** Validate a video the phone wants to upload. */
export function validateVideoUpload(claim: VideoUploadClaim, maxBytes: number): VideoUploadVerdict {
  const declared = normalizeMime(claim.contentType);
  const ext = extensionOf(claim.fileName);
  const fromExt = ext ? EXTENSION_TO_MIME[ext] ?? null : null;

  let contentType: VideoMime;
  if (declared) {
    if (!isVideoMime(declared)) {
      return { ok: false, error: `Unsupported video type ${declared} — use MP4, MOV or WebM.` };
    }
    if (ext && fromExt !== declared) {
      return { ok: false, error: `File extension .${ext} does not match ${declared}.` };
    }
    contentType = declared;
  } else if (fromExt) {
    contentType = fromExt;
  } else {
    return { ok: false, error: 'Unsupported video file — use MP4, MOV or WebM.' };
  }

  if (!Number.isSafeInteger(claim.sizeBytes) || claim.sizeBytes <= 0) {
    return { ok: false, error: 'The video is empty.' };
  }
  if (claim.sizeBytes > maxBytes) {
    return {
      ok: false,
      error: `The video is ${formatMegabytes(claim.sizeBytes)}; the limit is ${formatMegabytes(maxBytes)}.`,
    };
  }
  return { ok: true, contentType, extension: VIDEO_MIME_EXTENSIONS[contentType] };
}

type StoredVideoVerdict = { ok: true; sizeBytes: number } | { ok: false; error: string };

/**
 * Finalize check against what GCS actually stored (object metadata), not what
 * the phone said: the object must exist, be non-empty, fit the cap, and carry
 * the content type the upload URL was signed for.
 */
export function validateStoredVideo(
  stored: { exists: boolean; sizeBytes: number | null; contentType: string | null },
  expectedContentType: VideoMime,
  maxBytes: number,
): StoredVideoVerdict {
  if (!stored.exists) return { ok: false, error: 'The video never reached storage — upload it again.' };
  const size = stored.sizeBytes ?? 0;
  if (!Number.isSafeInteger(size) || size <= 0) return { ok: false, error: 'The stored video is empty.' };
  if (size > maxBytes) {
    return { ok: false, error: `The stored video is larger than ${formatMegabytes(maxBytes)}.` };
  }
  if (normalizeMime(stored.contentType) !== expectedContentType) {
    return { ok: false, error: `The stored video is not ${expectedContentType}.` };
  }
  return { ok: true, sizeBytes: size };
}

/** `0.4 MB`, `7.5 MB`, `512 MB` — one decimal under 10 MB so a short clip never reads as 0. */
export function formatMegabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
