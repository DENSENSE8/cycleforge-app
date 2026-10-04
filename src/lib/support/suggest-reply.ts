import 'server-only';
import { queryNemoClawRag } from '@/lib/ai/nemoclaw-rag';
import { aiRequestHeaders, isSelfHostedAiRuntime } from '@/lib/ai/provider';
import { resolveOrgAiConfig } from '@/lib/ai/org-provider';
import { hybridSearch } from '@/lib/search/hybrid-retrieval';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  suggestSupportReplyCore,
  SupportSuggestError,
  type SuggestDeps,
  type SupportSuggestion,
  type SupportSuggestionInput,
} from './suggest-reply-core';

/** Server bindings for the support-reply drafter — the real RAG call, the model gateways, and the model names. */

// The route maps this to an HTTP status. Every other type lives on the core —
// re-exporting a second door onto it is what knip calls, correctly, dead.
export { SupportSuggestError };

async function postChatCompletion(args: {
  url: string;
  headers: HeadersInit;
  model: string;
  system: string;
  content: unknown;
}): Promise<string> {
  const res = await fetch(`${args.url}/chat/completions`, {
    method: 'POST',
    headers: args.headers,
    body: JSON.stringify({
      model: args.model,
      messages: [
        { role: 'system', content: args.system },
        { role: 'user', content: args.content },
      ],
      stream: false,
      temperature: 0.3,
      max_tokens: 700,
      // A self-hosted reasoning model (gex45 vLLM Qwen3) otherwise spends the
      // whole budget thinking: ~50 s and a truncated reply. Managed endpoints
      // 400 on unknown params, so this rides ONLY to local runtimes.
      ...(isSelfHostedAiRuntime({ baseURL: args.url })
        ? { chat_template_kwargs: { enable_thinking: false } }
        : {}),
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new SupportSuggestError(
      502,
      `AI returned ${res.status}. Is the model gateway reachable?`,
      errBody.slice(0, 300),
    );
  }

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content || data?.reply || '';
  // Strip <think>...</think> reasoning blocks if the model includes them (mirrors /api/ai/chat).
  return String(raw).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

/** Both the text and the image lane now resolve THIS ORG's provider — the same one. */
function makeDefaultGenerate(orgId: OrgId) {
  return async function defaultGenerate({
    system,
    user,
    sessionTag,
    images,
  }: {
    system: string;
    user: string;
    sessionTag: string;
    images?: string[];
  }): Promise<string> {
    const cfg = await resolveOrgAiConfig(orgId, 'chat');
    if (!cfg) {
      throw new Error('No AI chat provider is connected for this organization');
    }

    if (images?.length) {
      return postChatCompletion({
        url: cfg.baseURL,
        headers: aiRequestHeaders(cfg, { 'X-Source': 'cycle-forge-support-suggest' }),
        model: cfg.model,
        system,
        content: [
          { type: 'text', text: user },
          ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
        ],
      });
    }

    return postChatCompletion({
      url: cfg.baseURL,
      headers: aiRequestHeaders(cfg, {
        'X-Hermes-Session-Id': sessionTag,
        'X-Source': 'cycle-forge-support-suggest',
      }),
      model: cfg.model,
      system,
      content: user,
    });
  };
}

/**
 * The model name to REPORT. A missing name must not take down a draft that
 * already generated, so an unresolvable provider degrades to a generic label
 * rather than throwing.
 */
function makeReportedModel(orgId: OrgId) {
  return async function reportedModel(usedImages: boolean): Promise<string> {
    const cfg = await resolveOrgAiConfig(orgId, 'chat').catch(() => null);
    if (cfg) return cfg.model;
    return usedImages ? 'cloud-multimodal' : 'unconfigured';
  };
}

/** The record kinds a customer question can be about; tickets (subject-only) and bins add noise. */
const SUPPORT_RECORD_TYPES = ['ORDER', 'SERIAL_UNIT', 'SKU', 'REPAIR', 'WARRANTY_CLAIM', 'RECEIVING'] as const;

function makeSuggestDeps(orgId: OrgId): SuggestDeps {
  return {
    queryRag: queryNemoClawRag,
    searchRecords: async (query) =>
      (await hybridSearch(orgId, query, { limit: 5, entityTypes: [...SUPPORT_RECORD_TYPES] })).hits,
    generate: makeDefaultGenerate(orgId),
    resolveModel: makeReportedModel(orgId),
  };
}

export function suggestSupportReply(
  /** Whose AI provider serves this call — required, never defaulted. */
  orgId: OrgId,
  input: SupportSuggestionInput,
  deps: SuggestDeps = makeSuggestDeps(orgId),
): Promise<SupportSuggestion> {
  return suggestSupportReplyCore(input, deps);
}
