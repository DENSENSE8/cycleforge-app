/**
 * Support-reply drafting — PURE orchestration, no `server-only` imports, so it
 * unit-tests with zero network. The server bindings (the real RAG call, the
 * model gateways, the model names) live in `suggest-reply.ts` and are injected
 * as {@link SuggestDeps}. Same split, for the same reason, as
 * `photos/analyze-core.ts` ↔ `photos/analyze.ts`.
 *
 * The draft is grounded in three things, kept apart because they are not
 * equally trustworthy: the org's document RAG, what a customer's PHOTO
 * deterministically shows, and the rows those identifiers matched in our data.
 *
 * **The tenant framing is resolved, never hardcoded** — see
 * `buildSupportSystemPrompt`. This module named a specific brand in its system
 * prompt until 2026-08-02, which meant a second tenant got a model claiming to
 * work for a company they have no relationship with.
 *
 * **The vision lane is a REQUIRED parameter with no default** — routing a
 * customer's image to a cloud model decides whether tenant data leaves their
 * hardware, and a default is a silent opt-out at every call site nobody visited
 * (`backend-patterns.md`).
 *
 * **A model is never handed an app route.** `imageUrls` are SIGNED STORAGE URLs
 * resolved server-side by the route. `/api/photos/[id]/content` 302s to one, and
 * a cloud model cannot follow a redirect behind this app's session cookie — it
 * would fetch a sign-in page and describe that instead.
 */

import type { RagQueryResult } from '@/lib/ai/nemoclaw-rag';
import type { SearchHit } from '@/lib/search/search-hit';
import { buildSupportSystemPrompt, type SupportReplyPersona } from './reply-persona';
import {
  flattenEvidenceMatches,
  renderEvidenceForPrompt,
  type PhotoEvidence,
} from './photo-evidence';
import type { SupportVisionLane } from './vision-lane';

export type SuggestionConfidence = 'high' | 'medium' | 'low';

/**
 * Where one piece of the draft's grounding came from.
 *
 * **Was `string[]` until Phase 4.** A bare string could only ever be a RAG
 * document name, so the moment the draft also stood on an OCR'd serial and a
 * matched `serial_units` row there was no way to say which was which — and a
 * draft about to reach a customer has to be able to.
 */
export interface SuggestionSource {
  type: 'thread' | 'ocr' | 'catalog' | 'rag';
  label: string;
}

export interface SupportSuggestionInput {
  ticketId: number;
  /** Ticket subject, for light framing (optional). */
  subject?: string;
  /** The customer's latest message. May be empty when a photo carries the ask. */
  question: string;
  /**
   * The TENANT's own framing (business name / vertical), resolved by the route
   * from org settings. Omitted ⇒ the generic "a reseller" clause. Never another
   * company's brand.
   */
  persona?: SupportReplyPersona;
  /**
   * Which lane may see the images. **Required, never defaulted.** `local-only`
   * means no image URL is sent anywhere and the model reasons over the
   * deterministic OCR / labels instead.
   */
  vision: SupportVisionLane;
  /** Deterministic image facts + our-data matches, from `collectPhotoEvidence`. */
  photos?: PhotoEvidence[];
  /**
   * Signed storage read URLs for those photos. Populated by the route only when
   * `vision === 'cloud-multimodal'`; ignored otherwise.
   */
  imageUrls?: string[];
}

export interface SupportSuggestion {
  suggestion: string;
  sources: SuggestionSource[];
  confidence: SuggestionConfidence;
  /**
   * Which lane actually ran — the operator must be able to see whether an image
   * left the tenant. Uses the lane vocabulary itself rather than a second set of
   * words for one axis.
   */
  mode: SupportVisionLane;
  model: string;
  /** Whether the document RAG returned usable grounding for this question. */
  grounded: boolean;
  /** Rows in OUR data the images resolved to. Empty when there were no photos. */
  searchHits: SearchHit[];
  /** Per-photo image facts, for the trust surface. */
  evidence: PhotoEvidence[];
}

/** Injectable collaborators so this is unit-testable with zero network. */
export interface SuggestDeps {
  queryRag: (query: string, topK?: number) => Promise<RagQueryResult>;
  generate: (prompt: {
    system: string;
    user: string;
    sessionTag: string;
    /** Signed image URLs — present ONLY on the cloud-multimodal lane. */
    images?: string[];
  }) => Promise<string>;
  /** The model name to REPORT for the lane that ran. Reported, never chosen. */
  resolveModel: (usedImages: boolean) => string;
}

export class SupportSuggestError extends Error {
  status: number;
  detail?: string;
  constructor(status: number, message: string, detail?: string) {
    super(message);
    this.name = 'SupportSuggestError';
    this.status = status;
    this.detail = detail;
  }
}

function scoreToConfidence(topScore: number | undefined): SuggestionConfidence {
  if (typeof topScore !== 'number') return 'medium';
  if (topScore >= 0.7) return 'high';
  if (topScore >= 0.4) return 'medium';
  return 'low';
}

/**
 * Confidence, with the image evidence folded in.
 *
 * A photo that resolved to a real row in our data is the strongest grounding
 * this loop can produce — stronger than a document match, because it names the
 * customer's actual unit. A photo whose identifiers matched NOTHING is the
 * opposite and caps the draft at `low`, however well the docs answered: the
 * assistant is then talking about an object it could not place, and a confident
 * paragraph about an unplaced object is the failure mode that reaches a
 * customer.
 */
export function resolveConfidence(input: {
  grounded: boolean;
  ragTopScore: number | undefined;
  photos: PhotoEvidence[];
  matchCount: number;
}): SuggestionConfidence {
  const base = input.grounded ? scoreToConfidence(input.ragTopScore) : 'low';
  if (!input.photos.length) return base;
  if (input.matchCount > 0) return input.grounded ? 'high' : 'medium';
  return 'low';
}

export function buildSources(input: {
  rag: RagQueryResult | null;
  photos: PhotoEvidence[];
  matches: SearchHit[];
  hasQuestion: boolean;
}): SuggestionSource[] {
  const sources: SuggestionSource[] = [];
  if (input.hasQuestion) sources.push({ type: 'thread', label: 'Customer message' });
  for (const label of input.rag?.sources ?? []) sources.push({ type: 'rag', label });
  for (const photo of input.photos) {
    for (const token of photo.decoded) sources.push({ type: 'ocr', label: token.value });
  }
  for (const hit of input.matches) {
    sources.push({ type: 'catalog', label: `${hit.entityType} · ${hit.title}` });
  }
  return sources;
}

export async function suggestSupportReplyCore(
  input: SupportSuggestionInput,
  deps: SuggestDeps,
): Promise<SupportSuggestion> {
  const question = input.question.trim();
  const photos = input.photos ?? [];
  // A photo alone IS a question ("what is this / is it covered"), so a ticket
  // whose latest message is just an image must still draft.
  if (!question && !photos.length) throw new SupportSuggestError(400, 'question is required');

  const matches = flattenEvidenceMatches(photos);

  // 1. Ground in the document RAG — best-effort. A RAG failure degrades to an
  //    ungrounded draft instead of failing the request. The images' own
  //    captions join the query so a photo-only ticket still has something to
  //    retrieve on.
  const ragQuery = [question, ...photos.map((p) => p.caption).filter(Boolean)].join(' ').trim();
  let rag: RagQueryResult | null = null;
  try {
    rag = ragQuery ? await deps.queryRag(ragQuery, 5) : null;
  } catch {
    rag = null;
  }

  const grounded = Boolean(rag?.answer?.trim());
  const groundingBlock = grounded
    ? `Grounding facts from the service documentation:\n${rag!.answer}`
    : 'No specific document grounding was found for this question.';

  const subjectLine = input.subject ? `Ticket subject: ${input.subject}\n` : '';
  const questionBlock = question
    ? `Customer message:\n${question}`
    : 'The customer sent an image with no message.';
  const user =
    [subjectLine + questionBlock, renderEvidenceForPrompt(photos), groundingBlock]
      .filter(Boolean)
      .join('\n\n') + '\n\nWrite the suggested reply now.';

  // 2. Compose. Images travel ONLY on the cloud lane, and only as the signed
  //    storage URLs the route resolved.
  const images = input.vision === 'cloud-multimodal' ? input.imageUrls ?? [] : [];
  const suggestion = (
    await deps.generate({
      system: buildSupportSystemPrompt(input.persona),
      user,
      sessionTag: `support-ticket-${input.ticketId}`,
      ...(images.length ? { images } : {}),
    })
  ).trim();

  // Whitespace is not a draft. The server binding already trims, but a caller
  // must not be able to hand an agent a blank box and call it a suggestion.
  if (!suggestion) throw new SupportSuggestError(502, 'The model returned an empty suggestion.');

  return {
    suggestion,
    sources: buildSources({ rag, photos, matches, hasQuestion: Boolean(question) }),
    confidence: resolveConfidence({
      grounded,
      ragTopScore: rag?.chunks?.[0]?.score,
      photos,
      matchCount: matches.length,
    }),
    // What actually RAN: asking for the cloud lane and sending no image is the
    // local lane, and reporting otherwise would tell the operator a customer's
    // photo left the building when it did not.
    mode: images.length ? 'cloud-multimodal' : 'local-only',
    model: deps.resolveModel(images.length > 0),
    grounded,
    searchHits: matches,
    evidence: photos,
  };
}
