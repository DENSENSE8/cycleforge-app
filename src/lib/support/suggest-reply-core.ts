/** Support-reply drafting — PURE orchestration, no `server-only` imports, so it unit-tests with zero network. */

import type { RagQueryResult } from '@/lib/ai/nemoclaw-rag';
import type { SearchHit } from '@/lib/search/search-hit';
import { buildSupportSystemPrompt, type SupportReplyPersona } from './reply-persona';
import {
  flattenEvidenceMatches,
  renderEvidenceForPrompt,
  type PhotoEvidence,
} from './photo-evidence';
import type { SupportThreadMessage } from './support-thread';
import type { SupportVisionLane } from './vision-lane';

export type SuggestionConfidence = 'high' | 'medium' | 'low';

/** Where one piece of the draft's grounding came from. */
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
  /** Recent public conversation, oldest first (`readSupportThread`). */
  thread?: SupportThreadMessage[];
  /** `YYYY-MM-DD` today, so a past pickup date or an old promise is not repeated as future. */
  today?: string;
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
  /** Our own records (orders, units, SKUs, repairs, warranty) matching the message — the local RAG arm. */
  searchRecords: (query: string) => Promise<SearchHit[]>;
  generate: (prompt: {
    system: string;
    user: string;
    sessionTag: string;
    /** Signed image URLs — present ONLY on the cloud-multimodal lane. */
    images?: string[];
  }) => Promise<string>;
  /** The model name to REPORT for the lane that ran. */
  resolveModel: (usedImages: boolean) => string | Promise<string>;
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

/** Confidence, with the image evidence folded in. */
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
  const thread = input.thread ?? [];
  // A photo alone IS a question ("what is this / is it covered"), and a case
  // staff logged for the customer is one too — only a ticket with none of the
  // three has nothing to answer.
  if (!question && !photos.length && !thread.length) {
    throw new SupportSuggestError(400, 'question is required');
  }

  const matches = flattenEvidenceMatches(photos);

  // What the case is ABOUT, for retrieval: the customer's words, else the
  // subject (customer, order, product) plus the latest staff log line.
  const ask = question || [input.subject, thread[thread.length - 1]?.text].filter(Boolean).join(' ');

  // 1. Ground — best-effort on every arm, concurrently. The service-manual RAG
  //    and our own records answer different halves of a support question
  //    ("how do I fix it" / "what did they buy, is it covered"); either one
  //    down still drafts from the other.
  const ragQuery = [ask, ...photos.map((p) => p.caption).filter(Boolean)].join(' ').trim();
  const [rag, found] = await Promise.all([
    ragQuery ? deps.queryRag(ragQuery, 5).catch(() => null) : null,
    ask ? deps.searchRecords(ask).catch(() => []) : [],
  ]);
  const records = dedupeHits(found, matches);

  const grounded = Boolean(rag?.answer?.trim());
  const groundingBlock = grounded
    ? `Grounding facts from the service documentation:\n${rag!.answer}`
    : 'No specific document grounding was found for this question.';

  const subjectLine = input.subject ? `Ticket subject: ${input.subject}\n` : '';
  const questionBlock = question
    ? `Latest customer message (the one you are answering):\n${question}`
    : thread.length
      ? "The customer's own words were not captured on this ticket; the log above was written by our staff. Write our next message to the customer about this case."
      : 'The customer sent an image with no message.';
  const user =
    [
      input.today ? `Today's date: ${input.today}.` : '',
      renderThreadForPrompt(thread, question),
      subjectLine + questionBlock,
      renderEvidenceForPrompt(photos),
      renderRecordsForPrompt(records),
      groundingBlock,
    ]
      .filter(Boolean)
      .join('\n\n') + '\n\nWrite the reply to the customer now.';

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
    sources: buildSources({
      rag,
      photos,
      matches: [...matches, ...records],
      hasQuestion: Boolean(question),
    }),
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
    model: await deps.resolveModel(images.length > 0),
    grounded,
    searchHits: [...matches, ...records],
    evidence: photos,
  };
}

/** Record hits not already surfaced by a photo — one row is one source, never two. */
function dedupeHits(hits: SearchHit[], already: SearchHit[]): SearchHit[] {
  const seen = new Set(already.map((h) => `${h.entityType}:${h.id}`));
  return hits.filter((h) => {
    const key = `${h.entityType}:${h.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The public conversation BEFORE the message being answered, so the reply never
 * repeats or contradicts what we already said. The latest customer turn is
 * printed once, under its own heading, not twice.
 */
function renderThreadForPrompt(thread: SupportThreadMessage[], question: string): string {
  const last = thread[thread.length - 1];
  const earlier = last?.role === 'customer' && last.text.trim() === question ? thread.slice(0, -1) : thread;
  if (!earlier.length) return '';
  const lines = earlier.map(
    (m) => `${m.role === 'customer' ? 'Customer' : 'Us'}${m.on ? ` (${m.on})` : ''}: ${m.text}`,
  );
  const heading = question
    ? 'Conversation so far (oldest first)'
    : 'Case log written by our staff (oldest first)';
  return `${heading}:\n${lines.join('\n\n')}`;
}

function renderRecordsForPrompt(records: SearchHit[]): string {
  if (!records.length) return '';
  const lines = records.map(
    (h) => `- ${h.entityType} — ${h.title}${h.subtitle ? ` (${h.subtitle})` : ''}`,
  );
  return `Records in our system that may relate (mention one only if it clearly matches):\n${lines.join('\n')}`;
}
