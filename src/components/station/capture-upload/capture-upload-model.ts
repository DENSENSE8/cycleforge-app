/**
 * Capture-upload visibility — the pure model.
 *
 * One vocabulary for "what happened to the photo I just took", shared by every
 * Station bench that captures evidence (Receiving · Pack · Unit today; FBA /
 * Pickup when they grow a queue). No React, no queue imports, no DOM — so the
 * summary law is unit-testable and the same rules serve the phone dock today
 * and a desk-side surface later.
 *
 * Why this exists: the three capture queues already ship a full
 * `queued → uploading → done | failed` machine with `retry()`, but the ONLY
 * consumer was a transient toast mounted in the mobile shell — and only for
 * receiving. A toast is not a completion signal on a scan floor: it is gone in
 * four seconds, it cannot be retried, and an operator three feet from the
 * screen with their hands on a carton never sees it. Station law is explicit
 * that pass/fail belongs on a card, not a corner toast
 * (6).
 *
 * Program: `docs/todo/station-realtime-capture-visibility-CLAUDE-CODE-PROMPT.md`
 * (P0 · D1 · D10).
 */

/**
 * The house vocabulary. Deliberately NOT the queues' own `UploadState`: they
 * say `done`, which describes the queue's bookkeeping ("this entry is finished
 * with"), where the operator's question is whether the evidence is *committed*
 * — uploaded to storage AND attached to the record. Same instant, honest noun.
 */
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

/**
 * Which state the surface should WEAR when several are live at once.
 *
 * `failed` outranks everything, including in-flight work. A burst of six photos
 * where one 403s must read as a failure, not as "Uploading 5…" — the whole
 * defect this program exists to close is a failure that never reached the
 * operator's eye. `committed` is the weakest: it is the resting confirmation,
 * and any newer activity supersedes it.
 */
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

/**
 * Fold the union into the one line + tone the card renders.
 *
 * Counts are reported alongside the tone rather than folded into it, so a
 * surface can say "1 failed" in rose while still showing that 5 are in flight —
 * the failure leads, but the in-flight work is not erased by it.
 */
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

/**
 * Turn a raw upload error into a human, actionable line.
 *
 * Moved here verbatim from `PhotoUploadToaster`, which owned the only copy: the
 * card and the toast must never disagree about what a 403 means to an operator,
 * and two copies of a regex ladder is exactly how they would drift.
 */
export function humanizeUploadError(raw: string): string {
  const v = raw.trim();
  if (/forbidden/i.test(v)) return "You don't have permission to add photos here.";
  if (/^upload failed \(401\)/i.test(v) || /unauthor/i.test(v)) return 'Signed out — sign in and retry.';
  if (/bucket/i.test(v) && /exist/i.test(v)) return 'Photo storage isn’t set up (bucket missing). Tell an admin.';
  if (/network|failed to fetch|load failed/i.test(v)) return 'Network dropped — retry from the gallery.';
  if (/storage|nas|adapter|gcs|blob|bucket/i.test(v)) return 'Storage is unreachable — retry shortly.';
  return v || 'Upload failed';
}

/**
 * The distinct reasons behind the failed entries, in first-seen order.
 *
 * Six photos that failed for ONE reason is one problem with one fix; the card
 * says it once instead of stacking six identical rows off the bottom of a phone
 * screen. (The toast path had the same instinct — it coalesced bursts — and
 * that judgement is preserved here rather than re-derived.)
 */
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
