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
import type { IntegrationProvider } from '@/lib/integrations/credentials';
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
  source: IntegrationProvider | 'platform';
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
    // Force a tool call — without this, small models occasionally answer with
    // prose ("Sure! Here's what I found:") instead of calling the tool. We send
    // exactly one tool, so `"required"` forces *that* tool. We use the string
    // form (not `{type:'function',function:{name}}`) because it's portable:
    // LM Studio only accepts none|auto|required, while OpenAI-compatible
    // gateways accept "required" too.
    tool_choice: 'required',
  };

  const { res, served } = await postToAiProvider(input.orgId, 'chat', {
    path: '/chat/completions',
    body: requestBody,
    headers: { 'content-type': 'application/json' },
    buildBody: (config) => ({ ...requestBody, model: config.model || DEFAULT_AI_MODEL }),
  });
  const model = served.model || DEFAULT_AI_MODEL;
  if (!res.ok) {
    const text = (await res.text()).slice(0, 500);
    throw new Error(`AI provider ${served.source} returned ${res.status}: ${text}`);
  }
  const data = (await res.json()) as OpenAiChatResponse;

  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    throw new Error(`Model "${model}" did not return a ${input.tool.name} tool call`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(toolCall.function.arguments);
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
