import 'server-only';
import { queryNemoClawRag } from '@/lib/ai/nemoclaw-rag';
import { getHermesApiUrl, getHermesHeaders, getHermesModel } from '@/lib/ai/hermes-client';
import { resolveAiConfig } from '@/lib/ai/provider';
import {
  suggestSupportReplyCore,
  SupportSuggestError,
  type SuggestDeps,
  type SupportSuggestion,
  type SupportSuggestionInput,
} from './suggest-reply-core';

/**
 * Server bindings for the support-reply drafter — the real RAG call, the model
 * gateways, and the model names. The orchestration itself (grounding, prompt
 * assembly, lane gating, confidence) is pure and lives in
 * {@link suggestSupportReplyCore}, so it unit-tests with zero network.
 *
 * Text-only generation goes to the local Hermes gateway. A request carrying
 * signed image URLs goes to the configured chat capability with OpenAI-format
 * multimodal content parts — and only ever on the `cloud-multimodal` lane the
 * route resolved.
 */

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

async function defaultGenerate({
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
  if (images?.length) {
    const cfg = resolveAiConfig('chat');
    return postChatCompletion({
      url: cfg.baseURL,
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
        'X-Source': 'cycle-forge-support-suggest',
      },
      model: cfg.model,
      system,
      content: [
        { type: 'text', text: user },
        ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
      ],
    });
  }

  return postChatCompletion({
    url: getHermesApiUrl(),
    headers: getHermesHeaders({
      'Content-Type': 'application/json',
      'X-Hermes-Session-Id': sessionTag,
      'X-Source': 'cycle-forge-support-suggest',
    }),
    model: getHermesModel(),
    system,
    content: user,
  });
}

/**
 * The model name to REPORT. `resolveAiConfig` throws loudly when the capability
 * is unconfigured — correct at a call site about to use it, wrong here, where a
 * missing name must not take down a draft that already generated.
 */
function reportedModel(usedImages: boolean): string {
  if (!usedImages) return getHermesModel();
  try {
    return resolveAiConfig('chat').model;
  } catch {
    return 'cloud-multimodal';
  }
}

const defaultDeps: SuggestDeps = {
  queryRag: queryNemoClawRag,
  generate: defaultGenerate,
  resolveModel: reportedModel,
};

export function suggestSupportReply(
  input: SupportSuggestionInput,
  deps: SuggestDeps = defaultDeps,
): Promise<SupportSuggestion> {
  return suggestSupportReplyCore(input, deps);
}
