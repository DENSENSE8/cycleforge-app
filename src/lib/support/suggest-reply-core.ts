/**
 * Support-reply drafting — PURE orchestration, no `server-only` imports, so it
 * unit-tests with zero network. Input is the LOCAL Support conversation
 * context (`SupportDraftContext`, read from our own store); no provider ticket
 * id reaches this layer.
 *
 *   ground (RAG + record search, best-effort) → prompt → generate →
 *   deterministic validators → channel policy → confidence + citations
 */

import type { RagQueryResult } from '@/lib/ai/nemoclaw-rag';
import type { SearchHit } from '@/lib/search/search-hit';
import type {
  SupportChannel,
  SupportDraftCitation,
  SupportDraftConfidence,
  SupportDraftKind,
} from '@/lib/support/conversation/model';
import { contextCitations, type SupportDraftContext } from './drafts/context';
import { buildSupportDraftPrompt, unansweredInbound } from './drafts/prompt';
import { downgradeConfidence, validateSupportDraft } from './drafts/validate';
import { flattenEvidenceMatches, type PhotoEvidence } from './photo-evidence';
import type { SupportReplyPersona } from './reply-persona';
import type { SupportVisionLane } from './vision-lane';

export type SuggestionConfidence = SupportDraftConfidence;

/** Where one piece of the draft's grounding came from — the stored citation shape. */
export type SuggestionSource = SupportDraftCitation;

export interface SupportSuggestionInput {
  /** The local conversation and every linked fact (`readSupportDraftContext`). */
  context: SupportDraftContext;
  kind: SupportDraftKind;
  /**
   * The TENANT's own framing (business name / vertical), resolved from org
   * settings. Omitted ⇒ the generic "a reseller" clause. Never another
   * company's brand.
   */
  persona?: SupportReplyPersona;
  /**
   * Which lane may see the images. **Required, never defaulted.** `local-only`
   * means no image URL is sent anywhere and the model reasons over the
   * deterministic OCR / labels instead.
   */
  vision: SupportVisionLane;
  /** Signed storage read URLs for `context.photos`; used only on `cloud-multimodal`. */
  imageUrls?: string[];
}

export interface SupportSuggestion {
  /** The draft body after validators and channel policy — what the staffer edits. */
  suggestion: string;
  sources: SuggestionSource[];
  confidence: SuggestionConfidence;
  /** Problems to check, clean-ups applied and policy rewrites, in that order. */
  warnings: string[];
  missingFacts: string[];
  /**
   * Which lane actually ran — the operator must be able to see whether an image
   * left the tenant. Uses the lane vocabulary itself rather than a second set of
   * words for one axis.
   */
  mode: SupportVisionLane;
  /** The model that actually served the draft (after failover). */
  model: string;
  /** Whether the document RAG returned usable grounding for this question. */
  grounded: boolean;
  /** Rows in OUR data the images resolved to, plus retrieved records. */
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
  }) => Promise<{ text: string; model: string }>;
  /** `applyMarketplacePolicy` — deterministic per-channel rewrite (links, contact details, length). */
  applyChannelPolicy: (channel: SupportChannel, body: string) => { body: string; changes: readonly string[] };
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
 * Confidence before validation: document grounding, then the linked local
 * records, with the image evidence folded in.
 */
export function resolveConfidence(input: {
  grounded: boolean;
  ragTopScore: number | undefined;
  /** Linked orders + record facts the draft could rely on. */
  localFacts: number;
  photos: PhotoEvidence[];
  matchCount: number;
}): SuggestionConfidence {
  const base = input.grounded ? scoreToConfidence(input.ragTopScore) : input.localFacts > 0 ? 'medium' : 'low';
  if (!input.photos.length) return base;
  if (input.matchCount > 0) return input.grounded || input.localFacts > 0 ? 'high' : 'medium';
  return 'low';
}

const POLICY_CHANGE_TEXT: Readonly<Record<string, string>> = {
  card_numbers_removed: 'Removed a card number.',
  emails_removed: 'Removed email addresses (marketplace policy).',
  links_removed: 'Removed links (marketplace policy).',
  phone_numbers_removed: 'Removed phone numbers (marketplace policy).',
  truncated: 'Shortened to the marketplace message limit.',
};

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

export async function suggestSupportReplyCore(
  input: SupportSuggestionInput,
  deps: SuggestDeps,
): Promise<SupportSuggestion> {
  const { context, kind } = input;
  const photos = context.photos;
  const answer = kind === 'reply' ? unansweredInbound(context.messages) : [];
  const question = answer.map((m) => m.body.trim()).filter(Boolean).join('\n');
  // A photo alone IS a question, a case staff logged for the customer is one
  // too, and a check-in needs no question — only a reply with none of these
  // has nothing to answer.
  if (kind === 'reply' && !question && !photos.length && !context.messages.length) {
    throw new SupportSuggestError(400, 'There is no customer message to answer.');
  }

  const matches = flattenEvidenceMatches(photos);
  const lastLine = context.messages[context.messages.length - 1]?.body;
  // What the case is ABOUT, for retrieval: the customer's words, else the
  // subject (customer, order, product) plus the latest log line.
  const ask = (question || [context.item.subject, kind === 'reply' ? lastLine : null].filter(Boolean).join(' ')).slice(0, 800);

  // 1. Ground — best-effort on every arm, concurrently. Either arm down still
  //    drafts from the linked local records.
  const ragQuery = [ask, ...photos.map((p) => p.caption).filter(Boolean)].join(' ').trim();
  const [rag, found] = await Promise.all([
    ragQuery ? deps.queryRag(ragQuery, 5).catch(() => null) : null,
    ask ? deps.searchRecords(ask).catch(() => [] as SearchHit[]) : ([] as SearchHit[]),
  ]);
  const records = dedupeHits(found, matches);
  const grounded = Boolean(rag?.answer?.trim());

  // 2. Compose. Images travel ONLY on the cloud lane, and only as the signed
  //    storage URLs the caller resolved.
  const prompt = buildSupportDraftPrompt({ context, kind, persona: input.persona, rag, records });
  const images = input.vision === 'cloud-multimodal' ? input.imageUrls ?? [] : [];
  const generated = await deps.generate({
    system: prompt.system,
    user: prompt.user,
    sessionTag: `support-item-${context.item.id}`,
    ...(images.length ? { images } : {}),
  });
  const raw = generated.text.trim();
  // Whitespace is not a draft: a caller must not be able to hand an agent a
  // blank box and call it a suggestion.
  if (!raw) throw new SupportSuggestError(502, 'The model returned an empty draft.');

  // 3. Deterministic checks, then the channel's policy on what is left.
  const checked = validateSupportDraft({
    body: raw,
    kind,
    context,
    extraSources: [
      rag?.answer ?? '',
      ...(rag?.chunks ?? []).map((c) => c.content),
      ...[...matches, ...records].map((h) => `${h.title} ${h.subtitle ?? ''}`),
    ],
  });
  if (!checked.body) throw new SupportSuggestError(502, 'The model returned only a signature or placeholders.');
  const policy = deps.applyChannelPolicy(context.item.channel, checked.body);
  const policyNotes = policy.changes.map((c) => POLICY_CHANGE_TEXT[c] ?? `Channel policy: ${c}.`);

  const base = resolveConfidence({
    grounded,
    ragTopScore: rag?.chunks?.[0]?.score,
    localFacts: context.orders.length + context.facts.filter((f) => f.citation.type !== 'past_reply').length,
    photos,
    matchCount: matches.length,
  });

  const sources: SuggestionSource[] = [
    ...contextCitations(context),
    ...(rag?.sources ?? []).map((label): SuggestionSource => ({ type: 'rag', label, ref: null })),
    ...[...matches, ...records].map(
      (hit): SuggestionSource => ({ type: 'rag', label: `${hit.entityType} · ${hit.title}`, ref: `${hit.entityType}:${hit.id}` }),
    ),
  ];

  return {
    suggestion: policy.body,
    sources,
    confidence: downgradeConfidence(base, checked),
    warnings: [...checked.warnings, ...checked.fixes, ...policyNotes],
    missingFacts: checked.missingFacts,
    // What actually RAN: asking for the cloud lane and sending no image is the
    // local lane, and reporting otherwise would tell the operator a customer's
    // photo left the building when it did not.
    mode: images.length ? 'cloud-multimodal' : 'local-only',
    model: generated.model,
    grounded,
    searchHits: [...matches, ...records],
    evidence: photos,
  };
}
