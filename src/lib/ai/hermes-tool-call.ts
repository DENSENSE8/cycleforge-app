/**
 * Shared forced-tool-call against the local Hermes gateway.
 *
 * Generalizes the proven pattern in `src/lib/po-gmail/extract-llm.ts`: a
 * single OpenAI-style chat-completions request that FORCES one tool call
 * (`tool_choice`), runs at `temperature: 0`, and returns the parsed tool
 * arguments. Local-only — posts to HERMES_API_URL with the model named in
 * AI_MODEL (default `gemma-4-e4b`). No cloud fallback: if the gateway is
 * down or the model returns invalid output, the caller gets a clear error.
 *
 * Every "agent does work" feature (PO extraction, claim drafting, …) should
 * route through here so the gateway plumbing lives in exactly one place. The
 * caller owns the system prompt, the tool schema, and how it interprets the
 * returned args.
 */

import { postToAiProvider } from '@/lib/ai/failover';
import { isSelfHostedAiRuntime } from '@/lib/ai/provider';
import type { AiProviderSource } from '@/lib/ai/org-provider';
import type { OrgId } from '@/lib/tenancy/constants';

// Default model when AI_MODEL isn't set — Gemma 4 e4B has explicit tool-call
// support, the most disciplined arg adherence we get from a sub-5GB local
// model. Swap by setting AI_MODEL; the Hermes runtime verifies it's loaded.
const DEFAULT_AI_MODEL = 'gemma-4-e4b';

export interface HermesTool {
  /** Tool name the model must call. */
  name: string;
  description: string;
  /** JSON Schema for the tool arguments (OpenAI `function.parameters` shape). */
  parameters: Record<string, unknown>;
}

export interface HermesToolCallInput {
  systemPrompt: string;
  userText: string;
  tool: HermesTool;
  /** Defaults to 0 — determinism nails down small-model tool adherence. */
  temperature?: number;
  /** Defaults to 1024. */
  maxTokens?: number;
  /**
   * Whose provider chain serves this call — REQUIRED, never defaulted.
   *
   * This used to be a pre-resolved `provider` config, which meant every caller
   * duplicated the same resolve-and-null-check and none of them could fail
   * over. Taking the org instead lets this function own the chain, so a cold
   * or unreachable local box falls forward to cloud instead of throwing
   * (backend-patterns.md → a safety classification is a REQUIRED parameter).
   */
  orgId: OrgId;
}

export interface HermesToolCallResult<T> {
  /** Parsed (but NOT validated) tool arguments — the caller owns validation. */
  args: T;
  /** Model id reported by the runtime (or the env default if omitted). */
  model: string;
  /** Which provider ACTUALLY answered — report this, never the preference. */
  source: AiProviderSource;
  usage: {
    input_tokens: number;
    output_tokens: number;
    /** Always 0 for the local Hermes path — kept for API stability. */
    cache_read_input_tokens: number;
  };
}

interface OpenAiChatResponse {
  choices?: Array<{
    message?: {
      role?: string;
      content?: string | null;
      /** Reasoning models split the think phase out of `content` — never tool args. */
      reasoning_content?: string | null;
      tool_calls?: Array<{
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string;
  }>;
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string } | string;
}

/**
 * Recover a tool call the RUNTIME failed to parse out of the model's text.
 *
 * Local runtimes parse the model's tool-call syntax with a per-template regex.
 * When that misses, the arguments are still right there in `content` — as a
 * Qwen-style `<tool_call>{…}</tool_call>` block or a bare JSON object — and
 * throwing "did not return a tool call" over a parser gap wastes an answer we
 * already paid for. Returns the raw argument JSON string, or null.
 *
 * Deliberately not a general JSON scraper: it takes the LAST balanced object,
 * because a model that narrates before complying leaves example objects earlier
 * in the text and the real call last.
 *
 * Exported for `hermes-tool-call.test.ts` — the brace scanner is the kind of
 * thing that looks right and mis-handles one escaped quote.
 */
export function recoverToolArgsFromContent(content: string): string | null {
  const tagged = [...content.matchAll(/<tool_call>([\s\S]*?)<\/tool_call>/g)].at(-1);
  const candidates: string[] = [];
  if (tagged?.[1]) candidates.push(tagged[1].trim());

  // Balanced-brace scan; string-aware so a `{` inside a value cannot open a
  // frame and a `"` inside an escaped sequence cannot close one.
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0 && start >= 0) candidates.push(content.slice(start, i + 1));
      if (depth < 0) depth = 0;
    }
  }

  for (const candidate of candidates.reverse()) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      // Tool arguments are always an object. A bare array or scalar in the
      // prose is narration, not a call.
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return candidate;
    } catch {
      /* not this one */
    }
  }
  return null;
}

export async function hermesToolCall<T = unknown>(
  input: HermesToolCallInput,
): Promise<HermesToolCallResult<T>> {
  const requestBody = {
    // The model is filled in per attempt by the failover loop below, because a
    // fall-forward to a different provider is also a fall-forward to a
    // different model name.
    model: DEFAULT_AI_MODEL,
    temperature: input.temperature ?? 0,
    max_tokens: input.maxTokens ?? 1024,
    messages: [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: input.userText },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: input.tool.name,
          description: input.tool.description,
          parameters: input.tool.parameters,
        },
      },
    ],
    // Ask for a tool call — without this, small models occasionally answer with
    // prose ("Sure! Here's what I found:") instead of calling the tool. We send
    // exactly one tool, so `"required"` names *that* tool. The string form is
    // the portable one: LM Studio accepts only none|auto|required, while
    // OpenAI-compatible gateways accept "required" too.
    //
    // On a self-hosted runtime this is a HINT, not a constraint (measured
    // 2026-09-02 against mlx-dspark: `"required"`, `"auto"`, and the named
    // `{type:'function',function:{name}}` form all returned byte-identical
    // completions). Nothing server-side forces compliance, which is why the two
    // mitigations below — thinking off, and `recoverToolArgsFromContent` — carry
    // this path rather than decorate it.
    tool_choice: 'required',
  };

  const { res, served } = await postToAiProvider(input.orgId, 'chat', {
    path: '/chat/completions',
    body: requestBody,
    buildBody: (config) => ({
      ...requestBody,
      model: config.model || DEFAULT_AI_MODEL,
      // Turn the think phase OFF on self-hosted runtimes.
      //
      // A reasoning model (Qwen3.x, DeepSeek-R1, …) charges its think phase
      // against `max_tokens`. Inside a forced single tool call that is fatal
      // rather than merely slow: the model reasons its way through the whole
      // budget and the response comes back `finish_reason: "length"` with no
      // tool call, which every caller here reads as "the model refused". On the
      // real claim-draft payload the think phase burned 1206 tokens and emitted
      // nothing; with thinking off the same call answers in 172 and preserves
      // the facts. Managed endpoints 400 on unknown body params, so this rides
      // only where it is understood (`isSelfHostedAiRuntime`).
      ...(isSelfHostedAiRuntime(config)
        ? { chat_template_kwargs: { enable_thinking: false } }
        : {}),
    }),
  });
  const model = served.model || DEFAULT_AI_MODEL;
  if (!res.ok) {
    const text = (await res.text()).slice(0, 500);
    throw new Error(`AI provider ${served.source} returned ${res.status}: ${text}`);
  }
  const data = (await res.json()) as OpenAiChatResponse;

  const choice = data.choices?.[0];
  const rawArgs =
    choice?.message?.tool_calls?.[0]?.function?.arguments ??
    recoverToolArgsFromContent(choice?.message?.content ?? '');
  if (!rawArgs) {
    // Name the finish_reason. `length` means the budget ran out BEFORE the call
    // — a `maxTokens` problem, not a model that refused — and the two used to be
    // indistinguishable from the error text.
    const finish = choice?.finish_reason ?? 'unknown';
    const hint =
      finish === 'length'
        ? ` (finish_reason: length — the ${input.maxTokens ?? 1024}-token budget ran out before the call)`
        : ` (finish_reason: ${finish})`;
    throw new Error(
      `Model "${model}" did not return a ${input.tool.name} tool call${hint}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArgs);
  } catch (err) {
    throw new Error(
      `Model "${model}" returned invalid JSON in tool args: ${
        err instanceof Error ? err.message : 'unknown'
      }`,
    );
  }

  return {
    args: parsed as T,
    model: data.model ?? model,
    source: served.source,
    usage: {
      input_tokens: data.usage?.prompt_tokens ?? 0,
      output_tokens: data.usage?.completion_tokens ?? 0,
      cache_read_input_tokens: 0,
    },
  };
}
