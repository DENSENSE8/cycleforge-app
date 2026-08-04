/**
 * Photo evidence for the support assistant — the DETERMINISTIC half of the
 * vision loop, and the whole differentiator.
 *
 * ```
 * analyze (local-first)  →  ocr_text / labels / damage / caption
 *          ↓
 * routeScan(token)       →  the ONE decoder: normalizes a printed handle,
 *                           a GS1 Digital Link or a mobile URL to its value
 *          ↓
 * hybridSearch(value)    →  the ONE search engine: SearchHit[] from OUR data
 * ```
 *
 * An OCR'd serial that resolves to a real `serial_units` row is the difference
 * between *"a chatbot looked at a photo"* and *"our system recognised this
 * unit."* Skipping straight to a multimodal model because it can read text
 * itself is the cheap wrong answer: it throws away the persisted
 * `photo_analysis` row that makes the photo searchable afterwards, and it burns
 * cloud tokens reading a barcode a local box already read.
 *
 * **Never a second matching engine.** `routeScan` is the only decoder and
 * `hybridSearch` the only search — this module composes both and matches
 * nothing itself. It deliberately does not SYNTHESIZE a hit for a token that
 * decoded but matched nothing: a fabricated title on a customer-facing draft is
 * worse than an honest absence, so a decode with no row is simply not evidence.
 *
 * Pure + DI'd ({@link PhotoEvidenceDeps}) so it unit-tests with zero network and
 * zero database — the server bindings live in `photo-evidence-deps.ts`.
 */

import type { PhotoAnalysisMetadata } from '@/lib/photos/analyze-types';
import type { ScanType } from '@/lib/barcode-routing';
import type { SearchHit } from '@/lib/search/search-hit';

/** What one staged photo contributed, image facts and our-data matches apart. */
export interface PhotoEvidence {
  photoId: number;
  caption: string | null;
  labels: string[];
  /** Raw OCR lines, as persisted — the trust surface shows these verbatim. */
  ocrText: string[];
  damageDetected: boolean;
  damageNotes: string | null;
  /** Identifiers the decoder recognised, whether or not they matched a row. */
  decoded: DecodedToken[];
  /** Rows in OUR data that these identifiers resolved to. */
  matches: SearchHit[];
}

export interface DecodedToken {
  /** The token as it was read off the photo. */
  raw: string;
  /** The value after `routeScan` normalization (a URL becomes its handle). */
  value: string;
  /** `null` when the decoder did not recognise the shape — it still gets searched. */
  type: ScanType | null;
  /** Whether this token resolved to at least one row. */
  matched: boolean;
}

/** Injectable collaborators — zero network, zero DB in a test. */
export interface PhotoEvidenceDeps {
  /**
   * Read the persisted analysis, running it if this photo has none. Returning
   * `null` means the photo could not be analysed at all; the photo still counts
   * as evidence with empty facts rather than failing the request.
   */
  analyze(photoId: number): Promise<PhotoAnalysisMetadata | null>;
  /** `routeScan` — the ONE decoder. */
  decode(raw: string): { type: ScanType; value: string } | null;
  /** `hybridSearch` — the ONE search engine. */
  search(query: string): Promise<SearchHit[]>;
}

/**
 * Per-photo caps. OCR on a shipping label reads a dozen lines of carrier
 * boilerplate; searching every token would spend a query per word to find the
 * same two rows.
 */
const MAX_TOKENS_PER_PHOTO = 12;
const MAX_MATCHES_PER_PHOTO = 6;
/** Below this, a token is noise (`of`, `lb`, `2 of 3`) rather than a handle. */
const MIN_TOKEN_LENGTH = 4;

const URL_RE = /^https?:\/\//i;

/**
 * Identifier candidates from OCR output.
 *
 * The filter is **"contains a digit"**, not a shape whitelist: every identifier
 * this app prints or scans carries digits (`R-1234`, `A0101101`, a GS1 Digital
 * Link, a tracking number, a serial), and prose read off a box does not. A
 * shape whitelist would have to name every format and would silently stop
 * finding the next one.
 */
export function extractEvidenceTokens(ocrText: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (candidate: string) => {
    const token = candidate.trim().replace(/[.,;:]+$/, '');
    if (token.length < MIN_TOKEN_LENGTH) return;
    if (!/\d/.test(token)) return;
    const key = token.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    if (out.length < MAX_TOKENS_PER_PHOTO) out.push(token);
  };

  for (const line of ocrText) {
    const trimmed = (line ?? '').trim();
    if (!trimmed) continue;
    // A URL is one token even though it contains slashes and colons — splitting
    // it would hand the decoder fragments of the thing it knows how to read.
    if (URL_RE.test(trimmed)) {
      push(trimmed);
      continue;
    }
    // An identifier has no spaces in it. Pushing a whole multi-word line took
    // "2 of 3" off a carton label and searched for it.
    for (const part of trimmed.split(/[\s|]+/)) push(part);
  }

  return out;
}

const EMPTY_FACTS = {
  caption: null,
  labels: [] as string[],
  ocrText: [] as string[],
  damageDetected: false,
  damageNotes: null as string | null,
};

/**
 * Analyse each staged photo and cross-reference what it says against our data.
 *
 * Photos are processed in order and a failure on one never fails the batch —
 * the record is never blocked by the assistant.
 */
export async function collectPhotoEvidence(
  photoIds: number[],
  deps: PhotoEvidenceDeps,
): Promise<PhotoEvidence[]> {
  const out: PhotoEvidence[] = [];

  for (const photoId of photoIds) {
    let metadata: PhotoAnalysisMetadata | null = null;
    try {
      metadata = await deps.analyze(photoId);
    } catch {
      metadata = null;
    }

    if (!metadata) {
      out.push({ photoId, ...EMPTY_FACTS, decoded: [], matches: [] });
      continue;
    }

    const decoded: DecodedToken[] = [];
    const matches: SearchHit[] = [];
    const seenHits = new Set<string>();

    for (const raw of extractEvidenceTokens(metadata.ocr_text ?? [])) {
      const route = deps.decode(raw);
      const value = route?.value ?? raw;

      let hits: SearchHit[] = [];
      try {
        hits = await deps.search(value);
      } catch {
        hits = [];
      }

      const fresh = hits.filter((hit) => {
        const key = `${hit.entityType}:${hit.id}`;
        if (seenHits.has(key)) return false;
        seenHits.add(key);
        return true;
      });

      decoded.push({ raw, value, type: route?.type ?? null, matched: hits.length > 0 });
      for (const hit of fresh) {
        if (matches.length < MAX_MATCHES_PER_PHOTO) matches.push(hit);
      }
    }

    out.push({
      photoId,
      caption: metadata.caption?.trim() || null,
      labels: metadata.labels ?? [],
      ocrText: metadata.ocr_text ?? [],
      damageDetected: Boolean(metadata.damage_detected),
      damageNotes: metadata.damage_notes ?? null,
      decoded,
      matches,
    });
  }

  return out;
}

/** Every match across the batch, de-duplicated — what the route returns. */
export function flattenEvidenceMatches(evidence: PhotoEvidence[]): SearchHit[] {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const photo of evidence) {
    for (const hit of photo.matches) {
      const key = `${hit.entityType}:${hit.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(hit);
    }
  }
  return out;
}

/**
 * The image half of the model's grounding block: what was SEEN, and what it
 * resolved to in our data. Kept here beside the extraction so the prompt and
 * the trust surface are derived from one shape.
 */
export function renderEvidenceForPrompt(evidence: PhotoEvidence[]): string {
  if (!evidence.length) return '';
  const blocks = evidence.map((photo, i) => {
    const lines: string[] = [`Image ${i + 1}:`];
    if (photo.caption) lines.push(`- Description: ${photo.caption}`);
    if (photo.labels.length) lines.push(`- Detected: ${photo.labels.join(', ')}`);
    if (photo.damageDetected) {
      lines.push(`- Visible damage: yes${photo.damageNotes ? ` — ${photo.damageNotes}` : ''}`);
    }
    if (photo.ocrText.length) lines.push(`- Text read: ${photo.ocrText.join(' | ')}`);
    for (const hit of photo.matches) {
      lines.push(`- Matches our record: ${hit.entityType} — ${hit.title} (${hit.subtitle})`);
    }
    if (!photo.matches.length && photo.decoded.length) {
      lines.push('- No record in our system matched the identifiers on this image.');
    }
    return lines.join('\n');
  });
  return `What the attached image(s) show:\n${blocks.join('\n\n')}`;
}
