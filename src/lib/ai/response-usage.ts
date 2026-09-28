/** response-usage — read token usage off an OpenAI-wire response (JSON or SSE) for metering, with a bytes/4 fallback. */

/** ≈ bytes per token for English/JSON under BPE tokenizers; the fallback when a provider reports nothing. */
const BYTES_PER_TOKEN = 4;

export function estimateTokensFromBytes(bytes: number): number {
  return bytes > 0 ? Math.ceil(bytes / BYTES_PER_TOKEN) : 0;
}

export interface ReportedUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Provider-reported usage, or null when absent. OpenAI wire (`prompt_tokens`/
 * `completion_tokens`) and Anthropic-style (`input_tokens`/`output_tokens`)
 * both appear behind gateways. All-zero counts are treated as absent — local
 * runtimes send `{prompt_tokens:0,…}` placeholders, and a zero row reads as
 * "free" rather than "unknown".
 */
export function usageFromPayload(payload: unknown): ReportedUsage | null {
  const usage = (payload as { usage?: Record<string, unknown> } | null)?.usage;
  if (!usage || typeof usage !== 'object') return null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
  const inputTokens = num(usage.prompt_tokens) || num(usage.input_tokens);
  const outputTokens = num(usage.completion_tokens) || num(usage.output_tokens);
  return inputTokens + outputTokens > 0 ? { inputTokens, outputTokens } : null;
}

/** Characters of generated text (content + tool-call args) in a completion or stream chunk. */
function generatedChars(payload: unknown): number {
  const choices = (payload as { choices?: unknown } | null)?.choices;
  if (!Array.isArray(choices)) return 0;
  let chars = 0;
  for (const choice of choices) {
    const part = (choice as { message?: unknown; delta?: unknown }).message
      ?? (choice as { delta?: unknown }).delta;
    if (!part || typeof part !== 'object') continue;
    const { content, reasoning_content, tool_calls } = part as {
      content?: unknown;
      reasoning_content?: unknown;
      tool_calls?: Array<{ function?: { arguments?: unknown } }>;
    };
    if (typeof content === 'string') chars += content.length;
    if (typeof reasoning_content === 'string') chars += reasoning_content.length;
    if (Array.isArray(tool_calls)) {
      for (const call of tool_calls) {
        const args = call?.function?.arguments;
        if (typeof args === 'string') chars += args.length;
      }
    }
  }
  return chars;
}

export interface ResponseUsageScan {
  /** Provider-reported counts; null → the caller estimates. */
  usage: ReportedUsage | null;
  /** Estimated output tokens from the generated text (or the raw body when it would not parse). */
  estimatedOutputTokens: number;
  /** Model the provider says answered, when it says. */
  model: string | null;
  /** The body errored before it finished (aborted stream, reset connection). */
  failed: boolean;
}

/**
 * Read a response body to the end and pull its usage. Meant for a `res.clone()`
 * so the caller's body is untouched. SSE is parsed incrementally — only the
 * partial line is buffered, never the whole stream.
 */
export async function scanResponseUsage(res: Response): Promise<ResponseUsageScan> {
  const isStream = (res.headers.get('content-type') ?? '').includes('text/event-stream');
  return isStream ? scanEventStream(res) : scanJson(res);
}

async function scanJson(res: Response): Promise<ResponseUsageScan> {
  let text = '';
  let failed = false;
  try {
    text = await res.text();
  } catch {
    failed = true;
  }
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  const estimatedOutputTokens = payload
    ? estimateTokensFromBytes(generatedChars(payload))
    : estimateTokensFromBytes(Buffer.byteLength(text, 'utf8'));
  const model = (payload as { model?: unknown } | null)?.model;
  return {
    usage: usageFromPayload(payload),
    estimatedOutputTokens,
    model: typeof model === 'string' && model ? model : null,
    failed,
  };
}

async function scanEventStream(res: Response): Promise<ResponseUsageScan> {
  let usage: ReportedUsage | null = null;
  let model: string | null = null;
  let chars = 0;
  let failed = false;
  let pending = '';

  const consumeLine = (line: string) => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return;
    let chunk: unknown;
    try {
      chunk = JSON.parse(data);
    } catch {
      return;
    }
    usage = usageFromPayload(chunk) ?? usage;
    chars += generatedChars(chunk);
    const m = (chunk as { model?: unknown }).model;
    if (typeof m === 'string' && m) model = m;
  };

  const reader = res.body?.getReader();
  if (reader) {
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        let nl = pending.indexOf('\n');
        while (nl >= 0) {
          consumeLine(pending.slice(0, nl).replace(/\r$/, ''));
          pending = pending.slice(nl + 1);
          nl = pending.indexOf('\n');
        }
      }
      pending += decoder.decode();
    } catch {
      failed = true;
    }
    if (pending) consumeLine(pending.replace(/\r$/, ''));
  }

  return { usage, estimatedOutputTokens: estimateTokensFromBytes(chars), model, failed };
}
