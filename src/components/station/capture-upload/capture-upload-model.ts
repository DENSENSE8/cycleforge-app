/** Capture-upload visibility — the pure model. */

/** The house vocabulary. */
export type CaptureUploadState = 'queued' | 'uploading' | 'committed' | 'failed';

/** Which bench's queue an entry came from. Drives retry routing + the label. */
export type CaptureUploadDomain = 'receiving' | 'pack' | 'unit';

export interface CaptureUploadEntry {
  /** Queue entry id — unique only WITHIN a domain, so never use it as a React key alone. */
  id: string;
  domain: CaptureUploadDomain;
  state: CaptureUploadState;
  /** Object URL for the captured frame; may be empty after a localStorage rehydrate. */
  previewUrl: string;
  /** Raw queue error, un-humanized. Render through {@link humanizeUploadError}. */
  error: string | null;
  createdAt: number;
}

/**
 * A React key that survives the union. Two domains can each mint entry `"3"`,
 * and a bare `id` key would make React reconcile a pack photo onto a receiving
 * row — swapping one operator's thumbnail for another's mid-upload.
 */
export function captureUploadKey(entry: Pick<CaptureUploadEntry, 'domain' | 'id'>): string {
  return `${entry.domain}:${entry.id}`;
}

/** Which state the surface should WEAR when several are live at once. */
export type CaptureUploadTone = 'idle' | 'committed' | 'active' | 'failed';

export interface CaptureUploadSummary {
  tone: CaptureUploadTone;
  /** `queued` + `uploading` — work the operator is still waiting on. */
  inFlight: number;
  failed: number;
  committed: number;
  total: number;
  /** One line, ≤ ~34 chars, legible at ~3 ft on a warehouse monitor. */
  headline: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Fold the union into the one line + tone the card renders. */
export function summarizeCaptureUploads(entries: CaptureUploadEntry[]): CaptureUploadSummary {
  let inFlight = 0;
  let failed = 0;
  let committed = 0;

  for (const e of entries) {
    if (e.state === 'failed') failed += 1;
    else if (e.state === 'committed') committed += 1;
    else inFlight += 1; // queued | uploading
  }

  const total = entries.length;

  if (failed > 0) {
    return {
      tone: 'failed',
      inFlight,
      failed,
      committed,
      total,
      headline: `${plural(failed, 'photo')} failed`,
    };
  }
  if (inFlight > 0) {
    return {
      tone: 'active',
      inFlight,
      failed,
      committed,
      total,
      headline: `Uploading ${plural(inFlight, 'photo')}…`,
    };
  }
  if (committed > 0) {
    return {
      tone: 'committed',
      inFlight,
      failed,
      committed,
      total,
      headline: `${plural(committed, 'photo')} saved`,
    };
  }
  return { tone: 'idle', inFlight: 0, failed: 0, committed: 0, total: 0, headline: '' };
}

/** Turn a raw upload error into a human, actionable line. */
export function humanizeUploadError(raw: string): string {
  const v = raw.trim();
  if (/forbidden/i.test(v)) return "You don't have permission to add photos here.";
  if (/^upload failed \(401\)/i.test(v) || /unauthor/i.test(v)) return 'Signed out — sign in and retry.';
  if (/bucket/i.test(v) && /exist/i.test(v)) return 'Photo storage isn’t set up (bucket missing). Tell an admin.';
  if (/network|failed to fetch|load failed/i.test(v)) return 'Network dropped — retry from the gallery.';
  if (/storage|nas|adapter|gcs|blob|bucket/i.test(v)) return 'Storage is unreachable — retry shortly.';
  return v || 'Upload failed';
}

/** The distinct reasons behind the failed entries, in first-seen order. */
export function distinctFailureReasons(entries: CaptureUploadEntry[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of entries) {
    if (e.state !== 'failed') continue;
    const reason = humanizeUploadError(e.error ?? '');
    if (seen.has(reason)) continue;
    seen.add(reason);
    out.push(reason);
  }
  return out;
}
