import 'server-only';

/**
 * Dedicated client for the 5070 Ti's Unlimited OCR model.
 *
 * This is intentionally separate from the product-photo vision service and
 * from the general AI provider chain. Paperwork bytes may only travel to this
 * explicitly configured private endpoint.
 */

export const UNLIMITED_OCR_DISPLAY_NAME = 'Unlimited OCR';
export const UNLIMITED_OCR_DEFAULT_MODEL = 'unlimited-ocr:latest';

export interface UnlimitedOcrConfig {
  /** OpenAI-compatible API root, normally `https://…/v1`, with no trailing slash. */
  baseUrl: string;
  model: string;
  apiKey: string;
  headers?: Record<string, string>;
}

export interface UnlimitedOcrDeps {
  fetchImpl: typeof fetch;
}

const defaultDeps: UnlimitedOcrDeps = { fetchImpl: fetch };

function readEnv(env: NodeJS.ProcessEnv, name: string): string {
  return String(env[name] ?? '').trim();
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function resolveUnlimitedOcrConfig(
  env: NodeJS.ProcessEnv = process.env,
): UnlimitedOcrConfig | null {
  const baseUrl = stripTrailingSlash(readEnv(env, 'UNLIMITED_OCR_BASE_URL'));
  if (!baseUrl) return null;

  const accessId = readEnv(env, 'UNLIMITED_OCR_CF_ACCESS_CLIENT_ID');
  const accessSecret = readEnv(env, 'UNLIMITED_OCR_CF_ACCESS_CLIENT_SECRET');
  const headers = {
    ...(accessId ? { 'CF-Access-Client-Id': accessId } : {}),
    ...(accessSecret ? { 'CF-Access-Client-Secret': accessSecret } : {}),
  };

  return {
    baseUrl,
    model: readEnv(env, 'UNLIMITED_OCR_MODEL') || UNLIMITED_OCR_DEFAULT_MODEL,
    apiKey: readEnv(env, 'UNLIMITED_OCR_API_KEY'),
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  };
}

export function unlimitedOcrHeaders(config: UnlimitedOcrConfig): Record<string, string> {
  return {
    'content-type': 'application/json',
    ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
    ...config.headers,
  };
}

interface OpenAiOcrResponse {
  model?: unknown;
  choices?: Array<{
    finish_reason?: unknown;
    message?: {
      content?: unknown;
    };
  }>;
}

export interface UnlimitedOcrResult {
  text: string;
  model: string;
}

function responseText(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const value = (part as { text?: unknown }).text;
      return typeof value === 'string' ? value : '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

/** Catch a broken runtime before hallucinated, looping text reaches intake. */
function hasPathologicalRepetition(text: string): boolean {
  const words = text.toLowerCase().replace(/\s+/g, ' ').trim().split(' ');
  if (words.length < 48) return false;

  const seen = new Map<string, number>();
  for (let index = 0; index + 12 <= words.length; index += 1) {
    const phrase = words.slice(index, index + 12).join(' ');
    const count = (seen.get(phrase) ?? 0) + 1;
    if (count >= 5) return true;
    seen.set(phrase, count);
  }
  return false;
}

/** Send one document image to the named Unlimited OCR model. */
export async function readImageWithUnlimitedOcr(
  bytes: Buffer,
  mimeType: string,
  config: UnlimitedOcrConfig,
  deps: UnlimitedOcrDeps = defaultDeps,
): Promise<UnlimitedOcrResult> {
  const dataUrl = `data:${mimeType};base64,${bytes.toString('base64')}`;
  const response = await deps.fetchImpl(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: unlimitedOcrHeaders(config),
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      max_tokens: 8192,
      skip_special_tokens: false,
      vllm_xargs: {
        ngram_size: 35,
        window_size: 128,
      },
      stream: false,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              // Unlimited OCR is trained against this literal prompt. Do not
              // replace it with general vision-model instructions.
              text: '<image>document parsing.',
            },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    throw new Error(
      `${UNLIMITED_OCR_DISPLAY_NAME} returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
    );
  }

  const body = (await response.json().catch(() => null)) as OpenAiOcrResponse | null;
  const text = responseText(body?.choices?.[0]?.message?.content);
  if (!text) throw new Error(`${UNLIMITED_OCR_DISPLAY_NAME} returned an empty transcription.`);
  if (body?.choices?.[0]?.finish_reason === 'length' || hasPathologicalRepetition(text)) {
    throw new Error(
      `${UNLIMITED_OCR_DISPLAY_NAME} returned an incomplete or repetitive transcription. The document was not imported.`,
    );
  }

  return {
    text,
    model: typeof body?.model === 'string' && body.model.trim() ? body.model.trim() : config.model,
  };
}
