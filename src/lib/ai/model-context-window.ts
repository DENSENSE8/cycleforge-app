/**
 * The context window of the model that served a turn — the denominator of the
 * composer's context ring.
 *
 * Resolution, first answer wins:
 *   1. `ASSISTANT_CONTEXT_WINDOW` (a deployment that knows better);
 *   2. a self-hosted OpenAI-wire runtime's own `/models` listing — vLLM reports
 *      `max_model_len`, llama.cpp / LM Studio `context_length` — cached per
 *      endpoint, since it only changes when the server restarts;
 *   3. the published window of a known hosted model (substring table);
 *   4. null — the ring then shows tokens used without a fraction.
 */

import type { AiProviderConfig } from './provider';
import { isSelfHostedAiRuntime } from './provider';

// Ordered — first match wins (more specific substrings first). Published
// provider limits, read 2026-09-27.
const WINDOWS: ReadonlyArray<{ match: string; tokens: number }> = [
  { match: 'claude', tokens: 200_000 },
  { match: 'gpt-4.1', tokens: 1_047_576 },
  { match: 'gpt-4o', tokens: 128_000 },
  { match: 'gpt-oss', tokens: 131_072 },
  { match: 'llama-4-scout', tokens: 131_000 },
  { match: 'glm-4.7-flash', tokens: 131_072 },
  { match: 'qwen3', tokens: 32_768 },
  { match: 'grok', tokens: 131_072 },
];

const tableWindow = (model: string) => WINDOWS.find((w) => model.toLowerCase().includes(w.match))?.tokens ?? null;

const PROBE_TTL_MS = 10 * 60 * 1000;
const probed = new Map<string, { tokens: number | null; at: number }>();

function positive(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
}

/**
 * The runtime's own answer. When the served id is an alias the listing does
 * not carry (mlx_lm.server's `default_model` = its `--model`, which it lists
 * as a local PATH beside cached `org/name` repos), the path entry is the
 * served model and its name keys the table.
 */
async function probeRuntimeWindow(config: Pick<AiProviderConfig, 'baseURL' | 'apiKey' | 'model' | 'headers'>): Promise<number | null> {
  const key = `${config.baseURL}|${config.model}`;
  const hit = probed.get(key);
  if (hit && Date.now() - hit.at < PROBE_TTL_MS) return hit.tokens;
  let tokens: number | null = null;
  try {
    const res = await fetch(`${config.baseURL.replace(/\/+$/, '')}/models`, {
      headers: { ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}), ...(config.headers ?? {}) },
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok) {
      const body = (await res.json()) as { data?: Array<Record<string, unknown>> };
      const models = body.data ?? [];
      const paths = models.filter((m) => typeof m.id === 'string' && m.id.startsWith('/'));
      const entry =
        models.find((m) => m.id === config.model) ??
        (models.length === 1 ? models[0] : paths.length === 1 ? paths[0] : undefined);
      if (entry) {
        tokens =
          positive(entry.max_model_len) ??
          positive(entry.context_length) ??
          positive(entry.max_context_length) ??
          (typeof entry.id === 'string' ? tableWindow(entry.id) : null);
      }
    }
  } catch {
    /* unreachable or slow — the table / null answers */
  }
  probed.set(key, { tokens, at: Date.now() });
  return tokens;
}

export async function resolveModelContextWindow(
  config: Pick<AiProviderConfig, 'baseURL' | 'apiKey' | 'model' | 'headers'>,
): Promise<number | null> {
  const pinned = positive(Number(process.env.ASSISTANT_CONTEXT_WINDOW));
  if (pinned) return pinned;
  if (isSelfHostedAiRuntime(config)) {
    const reported = await probeRuntimeWindow(config);
    if (reported) return reported;
  }
  return tableWindow(config.model);
}
